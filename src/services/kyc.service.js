/**
 * kyc.service.js
 * ---------------------------------------------------------------------------
 * IMPORTANT DESIGN NOTE:
 *
 * Doc me likha hai "Need to integrate third party API for KYC verification"
 * — par client ne abhi tak vendor (Signzy/Digio/HyperVerge/etc) finalize
 * nahi kiya (SCHEMA_NOTES.md ke 5 open sawalon me se ek).
 *
 * Isliye abhi ye flow MANUAL ADMIN REVIEW hai: user documents upload karta
 * hai, admin panel se dekh ke verify/reject karta hai. Ye khud ek poora
 * kaam karta hua system hai — production me bhi chal sakta hai.
 *
 * Jab client vendor finalize kare, to hum sirf ek naya step add karenge:
 * `submitDocuments()` ke andar, upload ke baad, third-party API ko call
 * karenge aur agar wo turant "auto-verified" bole to seedha verify() bula
 * denge. Baaki ka poora flow (status sync, audit log) same rahega.
 * ---------------------------------------------------------------------------
 */

const KycVerification = require('../models/kyc.model');
const User = require('../models/user.model');
const AppError = require('../utils/AppError');
const { uploadBuffer, getSignedKycUrl } = require('./upload.service');
const { logAdminAction } = require('./auditLog.service');
const notificationService = require('./notification.service');
const { KYC_STATUS, AUDIT_ACTION } = require('../constants/enums');

// Cloudinary ka signed download URL banane ke liye actual file extension
// chahiye (jaise "jpg", "pdf") — multer se sirf mimeType milta hai
const MIME_TO_FORMAT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * User apne documents submit karta hai.
 *
 * @param {String} userId
 * @param {Array} files - multer se aaye files, har ek me { buffer, mimetype, originalname }
 * @param {Array} docTypes - har file ke corresponding docType (same order)
 * @param {Object} businessInfo - { businessName, businessRegistrationNumber, businessType }
 */
async function submitDocuments(userId, files, docTypes, businessInfo = {}) {
  if (!files || files.length === 0) {
    throw new AppError('You must upload at least one document.', 400);
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found.', 404);

  // Existing KYC record dhoondo (reject ke baad dobara submit ho sakta hai)
  let kyc = await KycVerification.findOne({ userId }).sort({ createdAt: -1 });

  // Agar pehle se verified hai, to dobara submit karne ki zaroorat nahi
  if (kyc && kyc.status === KYC_STATUS.VERIFIED) {
    throw new AppError('Your KYC is already verified.', 400);
  }

  // Har file Cloudinary pe upload karo — PRIVATE (authenticated) type me,
  // kyunki ye sensitive ID documents hain
  const uploadedDocs = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const docType = docTypes[i] || 'government_id';
    const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image';

    const result = await uploadBuffer(file.buffer, {
      folder: `kyc-documents/${userId}`,
      isPrivate: true,
      resourceType,
    });

    uploadedDocs.push({
      docType,
      fileKey: result.public_id,
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
    });
  }

  if (!kyc || kyc.status === KYC_STATUS.REJECTED) {
    // Naya record, ya reject hone ke baad naya attempt
    const attemptCount = kyc ? kyc.attemptCount + 1 : 1;

    kyc = await KycVerification.create({
      userId,
      status: KYC_STATUS.SUBMITTED,
      documents: uploadedDocs,
      ...businessInfo,
      submittedAt: new Date(),
      attemptCount,
      statusHistory: [{ status: KYC_STATUS.SUBMITTED, reason: 'User submission' }],
    });
  } else {
    // Pending state me tha (documents add ho rahe the) — usi record me jodo
    kyc.documents.push(...uploadedDocs);
    Object.assign(kyc, businessInfo);
    kyc.status = KYC_STATUS.SUBMITTED;
    kyc.submittedAt = new Date();
    kyc.statusHistory.push({ status: KYC_STATUS.SUBMITTED, reason: 'Documents resubmitted' });
    await kyc.save();
  }

  // User ka quick-status cache bhi update — SCHEMA_NOTES.md ka rule:
  // "jo bhi duplicate hai, wo ek hi service call me dono jagah update hoga"
  user.kycStatus = KYC_STATUS.SUBMITTED;
  await user.save();

  return kyc;
}

async function getMyKyc(userId) {
  const kyc = await KycVerification.findOne({ userId }).sort({ createdAt: -1 });
  if (!kyc) {
    return null;
  }
  // Documents ke andar fileKey hai, direct URL nahi — user ko public
  // Cloudinary id dikhane ki zaroorat nahi, sirf status aur reason kaafi hai
  return {
    status: kyc.status,
    rejectionReason: kyc.rejectionReason,
    submittedAt: kyc.submittedAt,
    verifiedAt: kyc.verifiedAt,
    documentsCount: kyc.documents.length,
  };
}

/**
 * ADMIN — pending KYC list, purane pehle (FIFO — jo pehle aaya, pehle review ho)
 */
async function adminListPending({ page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    KycVerification.find({ status: KYC_STATUS.SUBMITTED })
      .sort({ submittedAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'fullName email phone'),
    KycVerification.countDocuments({ status: KYC_STATUS.SUBMITTED }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * ADMIN — sab KYC requests, chaahe kisi bhi status me ho (optional status filter)
 */
async function adminListAll({ page = 1, limit = 20, status } = {}) {
  const skip = (page - 1) * limit;
  const filter = status && status !== 'all' ? { status } : {};

  const [items, total] = await Promise.all([
    KycVerification.find(filter)
      .sort({ submittedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'fullName email phone'),
    KycVerification.countDocuments(filter),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * ADMIN — ek KYC ki detail, documents ke SIGNED (time-limited) URLs ke saath
 */
async function adminGetOne(kycId) {
  const kyc = await KycVerification.findById(kycId).populate('userId', 'fullName email phone');
  if (!kyc) throw new AppError('KYC record not found.', 404);

  // Har document ke liye 10-minute signed URL banao — admin ke liye hi
  const documentsWithUrls = kyc.documents.map((doc) => ({
    ...doc.toObject(),
    viewUrl: getSignedKycUrl(
      doc.fileKey,
      doc.mimeType === 'application/pdf' ? 'raw' : 'image',
      MIME_TO_FORMAT[doc.mimeType] || 'jpg'
    ),
  }));

  return { ...kyc.toObject(), documents: documentsWithUrls };
}

/**
 * ADMIN — verify ya reject karta hai. Ye function hi is module ka dil hai.
 *
 * @param {String} kycId
 * @param {Object} adminInfo - req.admin se { adminId, fullName, email }
 * @param {'verify'|'reject'} action
 * @param {String} [reason]
 */
async function adminReview(kycId, adminInfo, action, reason) {
  const kyc = await KycVerification.findById(kycId);
  if (!kyc) throw new AppError('KYC record not found.', 404);

  if (kyc.status !== KYC_STATUS.SUBMITTED) {
    throw new AppError(`This KYC is in "${kyc.status}" state and cannot be reviewed.`, 400);
  }

  const user = await User.findById(kyc.userId);
  if (!user) throw new AppError('User not found.', 404);

  const beforeStatus = kyc.status;

  if (action === 'verify') {
    kyc.status = KYC_STATUS.VERIFIED;
    kyc.verifiedAt = new Date();
    kyc.reviewedByAdminId = adminInfo.adminId;
    kyc.statusHistory.push({ status: KYC_STATUS.VERIFIED, reason: reason || 'Admin approved' });

    user.kycStatus = KYC_STATUS.VERIFIED;
  } else {
    kyc.status = KYC_STATUS.REJECTED;
    kyc.rejectedAt = new Date();
    kyc.rejectionReason = reason;
    kyc.reviewedByAdminId = adminInfo.adminId;
    kyc.statusHistory.push({ status: KYC_STATUS.REJECTED, reason });

    user.kycStatus = KYC_STATUS.REJECTED;
  }

  await kyc.save();
  await user.save();

  await logAdminAction({
    adminId: adminInfo.adminId,
    adminName: adminInfo.fullName,
    adminEmail: adminInfo.email,
    action: action === 'verify' ? AUDIT_ACTION.KYC_VERIFIED : AUDIT_ACTION.KYC_REJECTED,
    targetType: 'KycVerification',
    targetId: kyc._id,
    targetLabel: user.fullName,
    changesBefore: { status: beforeStatus },
    changesAfter: { status: kyc.status },
    reason,
  });

  await notificationService.notify(user._id, action === 'verify' ? 'kyc_verified' : 'kyc_rejected', { reason });

  return kyc;
}

module.exports = {
  submitDocuments,
  getMyKyc,
  adminListPending,
  adminListAll,
  adminGetOne,
  adminReview,
};
