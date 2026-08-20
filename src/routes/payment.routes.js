const express = require('express');
const router = express.Router();

const paymentController = require('../controllers/payment.controller');
const validate = require('../middlewares/validate');
const { authenticate, requireRole } = require('../middlewares/authenticate');
const { paymentInitiateLimiter } = require('../middlewares/rateLimiter');
const { verifyPaymentSchema, acceptTermsSchema } = require('../validators/payment.validator');

// ---- Initiate (Razorpay order banao) ----
router.post(
  '/emd/buyer/:auctionId/initiate',
  authenticate,
  requireRole('buyer'),
  paymentInitiateLimiter,
  paymentController.initiateBuyerEmd
);
router.post(
  '/emd/seller/:listingId/initiate',
  authenticate,
  requireRole('seller'),
  paymentInitiateLimiter,
  paymentController.initiateSellerEmd
);
router.post(
  '/purchase/:listingId/initiate',
  authenticate,
  requireRole('buyer'),
  paymentInitiateLimiter,
  validate(acceptTermsSchema),
  paymentController.initiateFixedPricePurchase
);
router.post(
  '/final-payment/:auctionId/initiate',
  authenticate,
  requireRole('buyer'),
  paymentInitiateLimiter,
  validate(acceptTermsSchema),
  paymentController.initiateFinalPayment
);

// ---- Verify (client-side, checkout complete hone ke baad) ----
router.post('/verify', authenticate, validate(verifyPaymentSchema), paymentController.verify);

// ---- Webhook (Razorpay server-se-server, koi auth middleware nahi —
// signature hi verification hai) ----
router.post('/webhook', paymentController.webhook);

module.exports = router;
