/**
 * otpHelper.js
 * ---------------------------------------------------------------------------
 * OTP banane aur check karne ke chhote helper functions.
 *
 * Hashing ke liye bcrypt use nahi kiya — bcrypt jaan-boojh kar SLOW hai
 * (password ke liye ye achhi baat hai). OTP sirf 5 min live rehta hai aur
 * 6 digit hi hota hai, isliye fast crypto hash (sha256) kaafi hai.
 * ---------------------------------------------------------------------------
 */

const crypto = require('crypto');

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;

// 6 digit random OTP — "000000" se "999999" tak
function generateOtp() {
  return crypto.randomInt(0, 1000000).toString().padStart(OTP_LENGTH, '0');
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function getExpiryDate() {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

module.exports = {
  generateOtp,
  hashOtp,
  getExpiryDate,
  OTP_EXPIRY_MINUTES,
  MAX_ATTEMPTS,
};
