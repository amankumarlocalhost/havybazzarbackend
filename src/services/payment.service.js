/**
 * payment.service.js
 * ---------------------------------------------------------------------------
 * Ye file har tarah ke payment (buyer EMD, seller EMD, fixed-price
 * purchase, auction final payment) ko EK hi pattern se handle karti hai:
 *
 *   1. initiate*() — Razorpay order banao, PaymentOrder record save karo
 *   2. verifyAndConfirm() — signature verify karo, PaymentOrder ko PAID
 *      maaro, phir purpose ke hisaab se sahi follow-up function call karo
 *
 * DOUBLE-CONFIRMATION SAFETY: verifyAndConfirm() do jagah se aa sakta hai —
 * client-side verify call, YA Razorpay ka webhook. Dono aa sakte hain
 * (redundancy achhi baat hai — Phase 6 ke reconciliation cron jaisa hi
 * pattern). Isliye `PaymentOrder.status` check karke idempotent banaya
 * hai — dusri baar aaye to kuch nahi hota, error bhi nahi.
 * ---------------------------------------------------------------------------
 */

const PaymentOrder = require('../models/paymentOrder.model');
const Auction = require('../models/auction.model');
const Listing = require('../models/listing.model');
const AppError = require('../utils/AppError');
const razorpayService = require('./razorpay.service');
const auctionService = require('./auction.service');
const listingService = require('./listing.service');
const orderService = require('./order.service');
const { PAYMENT_PURPOSE, PAYMENT_STATUS, LISTING_TYPE } = require('../constants/enums');

// -----------------------------------------------------------------------
// INITIATE — Razorpay order banana
// -----------------------------------------------------------------------

async function initiateBuyerEmd(auctionId, userId) {
  const { auction, alreadyJoined } = await auctionService.checkCanJoinAuction(auctionId, userId);
  if (alreadyJoined) {
    throw new AppError('You have already joined this auction.', 400);
  }

  return createPaymentOrder({
    userId,
    purpose: PAYMENT_PURPOSE.BUYER_EMD,
    referenceType: 'Auction',
    referenceId: auction._id,
    amountPaise: auction.emdAmountPaise,
  });
}

async function initiateSellerEmd(listingId, sellerId) {
  const listing = await Listing.findOne({ _id: listingId, sellerId });
  if (!listing) throw new AppError('Listing not found.', 404);
  if (listing.listingType !== LISTING_TYPE.AUCTION) {
    throw new AppError('This is a fixed-price listing, EMD is not required.', 400);
  }
  if (!listing.sellerEmdAmountPaise) {
    throw new AppError('No EMD amount is set on this listing.', 400);
  }

  return createPaymentOrder({
    userId: sellerId,
    purpose: PAYMENT_PURPOSE.SELLER_EMD,
    referenceType: 'Listing',
    referenceId: listing._id,
    amountPaise: listing.sellerEmdAmountPaise,
  });
}

async function initiateFixedPricePurchase(listingId, buyerId, acceptTerms) {
  if (!acceptTerms) {
    throw new AppError('You must accept the Terms & Conditions.', 400);
  }

  const listing = await Listing.findById(listingId);
  if (!listing) throw new AppError('Listing not found.', 404);
  if (listing.status !== 'active') throw new AppError('This listing is no longer available.', 400);
  if (listing.listingType !== LISTING_TYPE.FIXED_PRICE) {
    throw new AppError('This is an auction listing and cannot be purchased directly.', 400);
  }
  if (listing.sellerId.toString() === buyerId.toString()) {
    throw new AppError('You cannot buy your own listing.', 400);
  }

  return createPaymentOrder({
    userId: buyerId,
    purpose: PAYMENT_PURPOSE.FIXED_PRICE_PURCHASE,
    referenceType: 'Listing',
    referenceId: listing._id,
    amountPaise: listing.fixedPricePaise,
    termsAcceptedAt: new Date(),
  });
}

async function initiateFinalPayment(auctionId, winnerId, acceptTerms) {
  if (!acceptTerms) {
    throw new AppError('You must accept the Terms & Conditions.', 400);
  }

  const auction = await Auction.findById(auctionId);
  if (!auction) throw new AppError('Auction not found.', 404);
  if (auction.status !== 'closed' || !auction.winnerId) {
    throw new AppError('This auction has not closed yet or a winner has not been decided.', 400);
  }
  if (auction.winnerId.toString() !== winnerId.toString()) {
    throw new AppError('Only the winner can make the final payment.', 403);
  }

  const payableAmountPaise = auction.winningBidPaise - auction.emdAmountPaise;

  return createPaymentOrder({
    userId: winnerId,
    purpose: PAYMENT_PURPOSE.AUCTION_FINAL_PAYMENT,
    referenceType: 'Auction',
    referenceId: auction._id,
    amountPaise: payableAmountPaise,
    termsAcceptedAt: new Date(),
  });
}

async function createPaymentOrder({ userId, purpose, referenceType, referenceId, amountPaise, termsAcceptedAt }) {
  const receipt = `${purpose}-${referenceId}-${Date.now()}`.slice(0, 40); // Razorpay ka receipt max 40 char
  const razorpayOrder = await razorpayService.createOrder(amountPaise, receipt);

  const paymentOrder = await PaymentOrder.create({
    userId,
    purpose,
    referenceType,
    referenceId,
    amountPaise,
    razorpayOrderId: razorpayOrder.id,
    termsAcceptedAt,
  });

  return {
    paymentOrderId: paymentOrder._id,
    razorpayOrderId: razorpayOrder.id,
    amountPaise,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID, // frontend ko checkout kholne ke liye chahiye
  };
}

// -----------------------------------------------------------------------
// VERIFY & CONFIRM — payment ho gaya, ab follow-up action chalao
// -----------------------------------------------------------------------

/**
 * Client-side verification path. Frontend Razorpay checkout complete
 * karne ke baad ye teen values deta hai.
 */
async function verifyAndConfirm(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
  const isValid = razorpayService.verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
  if (!isValid) {
    throw new AppError('Payment signature verification failed — this may be a fraud attempt.', 400);
  }

  return confirmPayment(razorpayOrderId, razorpayPaymentId);
}

/**
 * Webhook path — Razorpay server-se-server bhejta hai. Signature
 * verification alag function me already ho chuka hota hai (controller
 * me, kyunki usko rawBody chahiye).
 */
async function confirmFromWebhook(razorpayOrderId, razorpayPaymentId) {
  return confirmPayment(razorpayOrderId, razorpayPaymentId);
}

/**
 * Poore Phase 7 ka core dispatcher — purpose dekh ke sahi follow-up
 * service ko call karta hai.
 *
 * IDEMPOTENT: agar ye dusri baar call ho (client-verify aur webhook
 * dono chal jaayein), `paymentOrder.status === PAID` check se turant
 * return ho jaata hai — dobara follow-up (jaise dobara Order banana)
 * nahi hota.
 */
async function confirmPayment(razorpayOrderId, razorpayPaymentId) {
  const paymentOrder = await PaymentOrder.findOne({ razorpayOrderId });
  if (!paymentOrder) {
    throw new AppError('Payment order not found.', 404);
  }

  if (paymentOrder.status === PAYMENT_STATUS.PAID) {
    return paymentOrder; // already processed — idempotent
  }

  paymentOrder.status = PAYMENT_STATUS.PAID;
  paymentOrder.razorpayPaymentId = razorpayPaymentId;
  paymentOrder.paidAt = new Date();
  await paymentOrder.save();

  switch (paymentOrder.purpose) {
    case PAYMENT_PURPOSE.BUYER_EMD:
      await auctionService.confirmBuyerEmdPaid(paymentOrder.referenceId, paymentOrder.userId);
      break;

    case PAYMENT_PURPOSE.SELLER_EMD:
      await listingService.markSellerEmdPaid(paymentOrder.referenceId);
      break;

    case PAYMENT_PURPOSE.FIXED_PRICE_PURCHASE:
      // NOTE: shippingAddress abhi User ke default address se liya jaata
      // hai — checkout ke waqt custom address dena Phase 8 ka scope hai
      await createOrderWithDefaultAddress(paymentOrder, 'fixed_price');
      break;

    case PAYMENT_PURPOSE.AUCTION_FINAL_PAYMENT:
      await createOrderWithDefaultAddress(paymentOrder, 'auction_win');
      break;

    default:
      throw new AppError(`Unknown payment purpose: ${paymentOrder.purpose}`, 500);
  }

  return paymentOrder;
}

async function createOrderWithDefaultAddress(paymentOrder, orderType) {
  const User = require('../models/user.model');
  const user = await User.findById(paymentOrder.userId);

  const defaultAddress = user.addresses.find((a) => a.isDefault) || user.addresses[0];
  if (!defaultAddress) {
    throw new AppError('An address is required to create an order — please add an address to your profile.', 400);
  }

  const shippingAddress = {
    line1: defaultAddress.line1,
    line2: defaultAddress.line2,
    city: defaultAddress.city,
    state: defaultAddress.state,
    country: defaultAddress.country,
    pincode: defaultAddress.pincode,
  };

  if (orderType === 'fixed_price') {
    return orderService.createOrderFromFixedPricePurchase(
      paymentOrder.referenceId,
      paymentOrder.userId,
      shippingAddress,
      paymentOrder.termsAcceptedAt
    );
  }

  const auction = await Auction.findById(paymentOrder.referenceId);
  return orderService.createOrderFromAuctionWin(auction, shippingAddress, paymentOrder.termsAcceptedAt);
}

module.exports = {
  initiateBuyerEmd,
  initiateSellerEmd,
  initiateFixedPricePurchase,
  initiateFinalPayment,
  verifyAndConfirm,
  confirmFromWebhook,
};
