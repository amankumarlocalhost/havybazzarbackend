/**
 * razorpay.service.js
 * ---------------------------------------------------------------------------
 * Razorpay se seedha baat karne wala EK jagah. Baaki poora codebase
 * `razorpayInstance` ko seedha kabhi touch nahi karega — sirf ye functions
 * call karega. Agar kal koi doosra gateway use karna pade, sirf ye file
 * badlegi (jaisa sms.service.js ka adapter pattern hai).
 * ---------------------------------------------------------------------------
 */

const crypto = require('crypto');
const razorpayConfig = require('../config/razorpay');
const AppError = require('../utils/AppError');

async function createOrder(amountPaise, receipt) {
  // Ye line try/catch ke BAHAR hai jaan-boojh kar — agar .env me keys
  // missing hain, to wo ek clear config-error hai, "dobara try karein"
  // wala gateway-error message nahi hona chahiye
  const razorpayInstance = razorpayConfig.getRazorpayInstance();

  try {
    return await razorpayInstance.orders.create({
      amount: amountPaise, // Razorpay bhi paise me hi leta hai — koi conversion nahi chahiye
      currency: 'INR',
      receipt,
    });
  } catch (err) {
    // Asli Razorpay error yahan log karo — client ko generic message hi
    // jaata hai (security), par server logs me poora detail chahiye
    // taaki "502, please try again" jaisa vague error debug ho sake.
    console.error('Razorpay order creation failed:', err?.error || err);

    // "Amount exceeds maximum amount allowed" — ye ek Razorpay ACCOUNT-LEVEL
    // cap hai (test/unactivated accounts ke liye), amount ka format ya code
    // ka bug nahi. Isliye alag, samajhne wala message dete hain — generic
    // "try again" bolna galat hai kyunki dobara try karne se kuch nahi badlega.
    if (err?.error?.description === 'Amount exceeds maximum amount allowed.') {
      throw new AppError(
        'This amount is higher than what our payment provider currently allows on this account. Please contact support.',
        400
      );
    }

    throw new AppError('Error creating payment order. Please try again.', 502);
  }
}

/**
 * Client-side verification — Razorpay checkout complete hone ke baad
 * frontend ye teen values bhejta hai. HMAC-SHA256 se signature verify
 * karte hain, taaki koi fake "payment successful" na bhej sake.
 */
function verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  return expectedSignature === razorpaySignature;
}

/**
 * Webhook verification — Razorpay server-se-server events bhejta hai
 * (jaise "payment.captured"). Ye alag secret use karta hai
 * (RAZORPAY_WEBHOOK_SECRET, jo Razorpay dashboard se milta hai).
 *
 * IMPORTANT: `rawBody` yahan RAW buffer hona chahiye, JSON-parsed object
 * nahi — warna signature match hi nahi hoga. Isliye app.js me
 * express.json() ka `verify` callback rawBody capture karta hai.
 */
function verifyWebhookSignature(rawBody, signature) {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  return expectedSignature === signature;
}

module.exports = { createOrder, verifyPaymentSignature, verifyWebhookSignature };
