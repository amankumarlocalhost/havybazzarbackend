/**
 * rateLimiter.js
 * ---------------------------------------------------------------------------
 * OTP aur login endpoints sabse zyada attack hote hain (brute force,
 * spam signups). Isliye inpe extra strict limits.
 *
 * NOTE: production me isko Redis store ke saath lagayenge (rate-limit-redis)
 * taaki agar aapke paas multiple server instances hon to limit sabme
 * shared rahe. Abhi single-server dev ke liye in-memory kaafi hai.
 * ---------------------------------------------------------------------------
 */

const rateLimit = require('express-rate-limit');

// OTP maangna: 5 baar per 15 minute, ek IP se
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many OTP requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Login attempts: 10 baar per 15 minute, ek IP se
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Bid placement: 20 bids per minute, ek IP se. Auto-bid resolution
 * automatically bhi bids create karta hai (user ki taraf se nahi), isliye
 * ye limit sirf MANUAL bid submit karne pe lagta hai — auto-bid engine
 * khud is limiter se nahi guzarta (wo seedha service-level call hai).
 */
const bidLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: 'You are bidding too fast. Please slow down and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Payment initiate: 10 baar per 10 minute — Razorpay order banana ek
// paid API call hai, isko spam se bachana zaroori hai
const paymentInitiateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many payment attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { otpLimiter, loginLimiter, bidLimiter, paymentInitiateLimiter };
