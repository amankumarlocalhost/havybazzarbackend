/**
 * kyc.model.js
 * ---------------------------------------------------------------------------
 * KYC ka poora record. User model me sirf `kycStatus` ka quick copy hai,
 * asli detail yahan hai.
 *
 * Ye alag collection kyun?
 *   1. Documents sensitive hain — inko alag rakhna behtar hai
 *   2. Ek user ki KYC reject ho sakti hai aur dobara submit ho sakti hai —
 *      history rakhni padegi
 *   3. Third-party API ka raw response bhi store karna hai (dispute ke liye)
 *   4. User document har request pe load hota hai — usme ye bhaari data
 *      nahi hona chahiye
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const { KYC_STATUS } = require('../constants/enums');

/**
 * Ek uploaded document.
 *
 * NOTE: fileUrl Cloudinary "authenticated" (private) delivery type ka
 * public_id hoga, direct public URL nahi.
 * Jab admin ko dikhana ho to backend pre-signed URL generate karega jo
 * 10 minute me expire ho jaayega. KYC documents kabhi publicly accessible
 * nahi hone chahiye.
 */
const kycDocumentSchema = new mongoose.Schema(
  {
    // "government_id", "address_proof", "business_registration"
    docType: { type: String, required: true, trim: true },

    // "passport", "aadhaar", "driving_license", "utility_bill"
    docSubType: { type: String, trim: true },

    // Cloudinary public_id (authenticated/private delivery)
    fileKey: { type: String, required: true, trim: true },

    originalFileName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    fileSizeBytes: { type: Number },

    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const kycSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(KYC_STATUS),
      default: KYC_STATUS.PENDING,
      index: true,
    },

    documents: { type: [kycDocumentSchema], default: [] },

    // -------------------------------------------------------------------
    // BUSINESS DETAILS (doc ke hisaab se optional hai)
    // -------------------------------------------------------------------
    businessName: { type: String, trim: true },
    businessRegistrationNumber: { type: String, trim: true },
    businessType: { type: String, trim: true },

    // -------------------------------------------------------------------
    // THIRD-PARTY API TRACKING
    // -------------------------------------------------------------------

    /**
     * Kaun sa KYC vendor use hua. Aaj Signzy hai, kal Digio ho sakta hai.
     * Isliye vendor ka naam store kar rahe hain — purane records ka
     * context nahi khoyega.
     *
     * TODO: client se confirm karna hai ki vendor kaun sa hoga.
     */
    providerName: { type: String, trim: true },

    // Vendor ke system me is verification ki id
    providerReferenceId: { type: String, trim: true, index: true, sparse: true },

    /**
     * Vendor ka poora raw response.
     *
     * `Mixed` type matlab kuch bhi ho sakta hai — kyunki har vendor ka
     * response format alag hota hai aur wo bina bataye badal bhi sakta hai.
     *
     * Ye store karna zaroori hai: kal koi dispute hua ("meri KYC kyun reject
     * hui?") to aapke paas vendor ka exact jawab hoga.
     */
    providerResponse: { type: mongoose.Schema.Types.Mixed },

    submittedAt: { type: Date },
    verifiedAt: { type: Date },
    rejectedAt: { type: Date },

    // Reject hua to kyun — user ko dikhana hai taaki wo theek kar sake
    rejectionReason: { type: String, trim: true },

    /**
     * Kis admin ne manually verify/reject kiya (agar manual review hua).
     * Auto-verify hua to ye null rahega.
     */
    reviewedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },

    /**
     * Kitni baar submit kiya. Reject hone pe user dobara try kar sakta hai.
     * Bahut zyada attempts = suspicious, admin ko flag karo.
     */
    attemptCount: { type: Number, default: 1 },

    /**
     * Status ki poori history — kab kya hua.
     * Ye append-only hai, purani entry kabhi edit nahi hogi.
     */
    statusHistory: {
      type: [
        {
          status: { type: String, enum: Object.values(KYC_STATUS) },
          changedAt: { type: Date, default: Date.now },
          reason: { type: String, trim: true },
          _id: false,
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

// -------------------------------------------------------------------------
// INDEXES
// -------------------------------------------------------------------------

// Admin panel: "sab pending KYC dikhao, purane pehle"
kycSchema.index({ status: 1, submittedAt: 1 });

// Ek user ki latest KYC attempt nikalne ke liye
kycSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('KycVerification', kycSchema);
