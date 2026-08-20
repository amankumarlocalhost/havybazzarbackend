const paymentService = require('../services/payment.service');
const razorpayService = require('../services/razorpay.service');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

exports.initiateBuyerEmd = catchAsync(async (req, res) => {
  const result = await paymentService.initiateBuyerEmd(req.params.auctionId, req.user.userId);
  res.status(200).json({ success: true, data: result });
});

exports.initiateSellerEmd = catchAsync(async (req, res) => {
  const result = await paymentService.initiateSellerEmd(req.params.listingId, req.user.userId);
  res.status(200).json({ success: true, data: result });
});

exports.initiateFixedPricePurchase = catchAsync(async (req, res) => {
  const result = await paymentService.initiateFixedPricePurchase(
    req.params.listingId,
    req.user.userId,
    req.body.acceptTerms
  );
  res.status(200).json({ success: true, data: result });
});

exports.initiateFinalPayment = catchAsync(async (req, res) => {
  const result = await paymentService.initiateFinalPayment(
    req.params.auctionId,
    req.user.userId,
    req.body.acceptTerms
  );
  res.status(200).json({ success: true, data: result });
});

exports.verify = catchAsync(async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  await paymentService.verifyAndConfirm(razorpayOrderId, razorpayPaymentId, razorpaySignature);
  res.status(200).json({ success: true, message: 'Payment confirmed successfully' });
});

/**
 * WEBHOOK — Razorpay server-se-server call karta hai. `req.rawBody`
 * app.js ke express.json() verify-callback se aata hai (signature ke
 * liye raw buffer chahiye, parsed JSON nahi).
 */
exports.webhook = catchAsync(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];

  const isValid = razorpayService.verifyWebhookSignature(req.rawBody, signature);
  if (!isValid) {
    throw new AppError('Invalid webhook signature', 400);
  }

  const event = req.body.event;

  if (event === 'payment.captured') {
    const payment = req.body.payload.payment.entity;
    await paymentService.confirmFromWebhook(payment.order_id, payment.id);
  }

  // Razorpay ko turant 200 bhejo — warna wo retry karta rahega
  res.status(200).json({ received: true });
});
