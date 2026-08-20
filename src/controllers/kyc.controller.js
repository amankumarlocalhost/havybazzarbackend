const kycService = require('../services/kyc.service');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// ---- User side ----

exports.submitDocuments = catchAsync(async (req, res) => {
  const files = req.files; // multer se aayenge
  // Form-data me "docTypes" ek JSON string array ke roop me aayega,
  // e.g. docTypes=["government_id","address_proof"]
  let docTypes = [];
  try {
    docTypes = req.body.docTypes ? JSON.parse(req.body.docTypes) : [];
  } catch (e) {
    throw new AppError('docTypes must be a valid JSON array', 400);
  }

  const { businessName, businessRegistrationNumber, businessType } = req.body;

  const kyc = await kycService.submitDocuments(req.user.userId, files, docTypes, {
    businessName,
    businessRegistrationNumber,
    businessType,
  });

  res.status(200).json({
    success: true,
    message: 'KYC documents submitted, awaiting review',
    data: { status: kyc.status, submittedAt: kyc.submittedAt },
  });
});

exports.getMyKyc = catchAsync(async (req, res) => {
  const kyc = await kycService.getMyKyc(req.user.userId);
  res.status(200).json({ success: true, data: kyc });
});

// ---- Admin side ----

exports.adminListPending = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const result = await kycService.adminListPending({ page, limit });
  res.status(200).json({ success: true, data: result });
});

exports.adminListAll = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const { status } = req.query;
  const result = await kycService.adminListAll({ page, limit, status });
  res.status(200).json({ success: true, data: result });
});

exports.adminGetOne = catchAsync(async (req, res) => {
  const kyc = await kycService.adminGetOne(req.params.kycId);
  res.status(200).json({ success: true, data: kyc });
});

exports.adminReview = catchAsync(async (req, res) => {
  const { action, reason } = req.body;
  const kyc = await kycService.adminReview(req.params.kycId, req.admin, action, reason);
  res.status(200).json({
    success: true,
    message: action === 'verify' ? 'KYC verified' : 'KYC rejected',
    data: { status: kyc.status },
  });
});
