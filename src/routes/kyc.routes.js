const express = require('express');
const router = express.Router();

const kycController = require('../controllers/kyc.controller');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { authenticateAdmin, requirePermission } = require('../middlewares/authenticateAdmin');
const { uploadKycDocs } = require('../middlewares/upload');
const { reviewKycSchema } = require('../validators/kyc.validator');
const { PERMISSION } = require('../constants/enums');

// ---- User routes ----
router.post(
  '/submit',
  authenticate,
  uploadKycDocs.array('documents', 5), // max 5 files ek saath
  kycController.submitDocuments
);
router.get('/me', authenticate, kycController.getMyKyc);

// ---- Admin routes ----
router.get(
  '/admin/pending',
  authenticateAdmin,
  requirePermission(PERMISSION.KYC_VIEW),
  kycController.adminListPending
);
router.get(
  '/admin/all',
  authenticateAdmin,
  requirePermission(PERMISSION.KYC_VIEW),
  kycController.adminListAll
);
router.get(
  '/admin/:kycId',
  authenticateAdmin,
  requirePermission(PERMISSION.KYC_VIEW),
  kycController.adminGetOne
);
router.post(
  '/admin/:kycId/review',
  authenticateAdmin,
  requirePermission(PERMISSION.KYC_VERIFY),
  validate(reviewKycSchema),
  kycController.adminReview
);

module.exports = router;
