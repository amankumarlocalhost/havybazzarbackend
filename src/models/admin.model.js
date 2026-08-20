/**
 * admin.model.js
 * ---------------------------------------------------------------------------
 * Admin panel ke users. Ye User collection se BILKUL ALAG hai.
 *
 * Kyun alag?
 *   1. Admin kabhi buyer ya seller nahi banega — koi overlap hi nahi hai
 *   2. Security: admin login alag URL pe, alag JWT secret, alag session rules
 *   3. Agar galti se koi bug User collection me role='admin' set kar de,
 *      to poora platform gaya. Alag collection = wo galti possible hi nahi
 *
 * Ye "defense in depth" hai — ek layer fail ho to doosri bachaayegi.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const { ADMIN_ROLE, PERMISSION } = require('../constants/enums');

const adminUserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false, // kabhi apne aap response me nahi aayega
    },

    fullName: { type: String, required: true, trim: true },

    phone: { type: String, trim: true },

    role: {
      type: String,
      enum: Object.values(ADMIN_ROLE),
      default: ADMIN_ROLE.SUB_ADMIN,
      required: true,
    },

    /**
     * Sub-admin ke permissions.
     *
     * Super Admin ke liye ye array khaali rahega — kyunki uske liye
     * permission check hota hi nahi, usko sab milta hai. Ye logic
     * middleware me hoga:
     *
     *   if (admin.role === SUPER_ADMIN) return next();
     *   if (!admin.permissions.includes(required)) return forbidden();
     *
     * Ye tareeka isliye behtar hai ki Super Admin ke permissions list
     * maintain nahi karni padti — naya permission add karo, Super Admin
     * ko apne aap mil jaata hai.
     */
    permissions: {
      type: [String],
      enum: Object.values(PERMISSION),
      default: [],
    },

    /**
     * Kis Super Admin ne isko banaya.
     * Pehla Super Admin seed script se banega, uska ye field null hoga.
     */
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },

    isActive: { type: Boolean, default: true, index: true },

    // ---------------------------------------------------------------------
    // SECURITY FIELDS
    // ---------------------------------------------------------------------

    lastLoginAt: { type: Date },

    // Kis IP se login hua — suspicious activity pakadne ke liye
    lastLoginIp: { type: String, trim: true },

    /**
     * Brute force attack rokne ke liye.
     *
     * 5 galat password ke baad account 30 minute ke liye lock.
     * Admin panel pe ye zaroori hai — yahan hack hone ka nuksaan
     * sabse zyada hai.
     */
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },

    /**
     * Password kab badla tha.
     *
     * Iska ek smart use hai: JWT token me issue time hota hai. Agar
     * password change ka time token ke issue time se naya hai, to us
     * token ko reject kar do. Isse password badalne pe purane sab
     * sessions apne aap logout ho jaate hain.
     */
    passwordChangedAt: { type: Date },

    /**
     * 2FA — abhi scope me nahi hai par field rakh raha hoon.
     *
     * Admin ke paas paisa release karne ki power hai. Client ko main
     * strongly recommend karunga ki ye enable karein. Field abhi hai,
     * implementation baad me.
     */
    isTwoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// -------------------------------------------------------------------------
// INDEXES
// -------------------------------------------------------------------------
adminUserSchema.index({ role: 1, isActive: 1 });

// -------------------------------------------------------------------------
// METHODS
// -------------------------------------------------------------------------

/**
 * Check karta hai ki is admin ke paas ye permission hai ya nahi.
 *
 * Super Admin ke liye hamesha true — usko sab access hai.
 *
 * Ye method model pe isliye rakha hai taaki har controller me
 * ye logic dobara na likhna pade.
 */
adminUserSchema.methods.hasPermission = function (permission) {
  if (this.role === ADMIN_ROLE.SUPER_ADMIN) {
    return true;
  }
  return this.permissions.includes(permission);
};

/**
 * Account abhi locked hai ya nahi (failed login ki wajah se).
 */
adminUserSchema.methods.isLocked = function () {
  if (!this.lockedUntil) {
    return false;
  }
  return this.lockedUntil > new Date();
};

module.exports = mongoose.model('AdminUser', adminUserSchema);
