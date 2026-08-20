/**
 * otp.model.js
 * ---------------------------------------------------------------------------
 * OTP ko User model ke andar EMBED nahi kiya — alag collection banaya.
 *
 * Kyun?
 *   1. OTP short-lived hai (5 min), User document permanent hai. Dono ki
 *      "lifecycle" alag hai, isliye alag collection sahi design hai.
 *   2. Ek hi user 5 min me 3 baar OTP maang sakta hai (resend). Agar User
 *      document me embed karte to purana OTP overwrite karna padta aur
 *      "kitni baar try kiya" ka history kho jaata.
 *   3. TTL index (neeche dekhiye) MongoDB ko khud expired OTPs delete karne
 *      deta hai. User document pe ye trick nahi chal sakti.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const { OTP_PURPOSE } = require('../constants/enums');

const otpSchema = new mongoose.Schema(
  {
    // Email ya phone — jo bhi channel use hua
    identifier: { type: String, required: true, trim: true, lowercase: true, index: true },

    /**
     * OTP ka PLAIN text kabhi store nahi hoga — sirf uska hash.
     * Wajah wahi jo password ke saath hai: agar database leak ho jaaye,
     * to attacker OTPs padh ke kisi ke bhi account me ghus sakta hai.
     */
    otpHash: { type: String, required: true, select: false },

    purpose: {
      type: String,
      enum: Object.values(OTP_PURPOSE),
      required: true,
    },

    /**
     * Kitni baar galat OTP daala. 5 attempts ke baad ye OTP hamesha ke
     * liye invalid maana jaayega, naya maangna padega. Isse brute-force
     * (0000 se 9999 tak try karna) rokta hai.
     */
    attempts: { type: Number, default: 0 },

    isUsed: { type: Boolean, default: false },

    /**
     * TTL INDEX — ye MongoDB ka special feature hai.
     * `expires: 0` ka matlab: jab bhi current time is field ki value se
     * aage nikal jaaye, MongoDB khud background me ye document delete
     * kar dega. Humein khud se cleanup cron chalane ki zaroorat nahi.
     */
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

// Ek identifier ke liye baar-baar query hogi ("iska koi valid OTP hai?")
otpSchema.index({ identifier: 1, purpose: 1, createdAt: -1 });

module.exports = mongoose.model('Otp', otpSchema);
