/**
 * user.model.js
 * ---------------------------------------------------------------------------
 * BADA DESIGN DECISION: Buyer aur Seller ki alag-alag collection NAHI hai.
 *
 * Kyun? Kyunki doc me "Role Switcher" hai — ek hi aadmi aaj buyer hai aur kal
 * seller ban sakta hai. Agar do collections banate to:
 *   - Ek hi aadmi ka data do jagah duplicate hota
 *   - Email/phone uniqueness check do jagah karna padta
 *   - Role switch karne pe data copy karna padta (bug ka ghar)
 *
 * Isliye ek hi User collection, aur usme `roles` ek array hai.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const { USER_ROLE, USER_STATUS, KYC_STATUS, LANGUAGE } = require('../constants/enums');

/**
 * Address ek sub-schema hai. `_id: false` isliye kyunki har address ko apni
 * alag id ki zaroorat nahi — ye user ke andar hi rehta hai.
 */
const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },        // "Office", "Site", "Home"
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },

    // NOTE: doc kehta hai listing filtering STATE level pe hogi, city pe nahi.
    // Isliye state pe index lagega, city pe nahi.
    state: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'India' },
    pincode: { type: String, required: true, trim: true },

    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: false }
);

const userSchema = new mongoose.Schema(
  {
    // ---------------------------------------------------------------------
    // LOGIN CREDENTIALS
    // ---------------------------------------------------------------------

    /**
     * Email optional hai kyunki doc ke hisaab se user sirf phone se bhi
     * signup kar sakta hai. Par email ya phone me se ek to hona hi chahiye —
     * ye validation service layer me hogi (schema level pe "ya to A ya B"
     * wali condition Mongoose me clean nahi likhi jaati).
     *
     * `sparse: true` matlab: jinke paas email nahi hai unko unique index
     * ignore karega. Warna 100 users bina email ke honge to sab "null"
     * duplicate maane jaayenge aur error aayega.
     */
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },

    phone: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },

    countryCode: { type: String, default: '+91', trim: true },

    /**
     * IMPORTANT: yahan password ka HASH store hoga, plain password kabhi nahi.
     * Hashing service layer me bcrypt/argon2 se hogi.
     *
     * `select: false` ka matlab: jab bhi koi User.find() karega, ye field
     * response me apne aap NAHI aayega. Login ke waqt explicitly
     * .select('+passwordHash') karna padega.
     *
     * Ye ek chhota sa safety net hai — galti se bhi password hash API
     * response me leak nahi hoga.
     */
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    // ---------------------------------------------------------------------
    // VERIFICATION FLAGS
    // ---------------------------------------------------------------------
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },

    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.UNVERIFIED,
      index: true,
    },

    // ---------------------------------------------------------------------
    // ROLES — yahi role switcher ka dil hai
    // ---------------------------------------------------------------------

    /**
     * Signup pe har koi buyer hota hai. Seller banne ke liye user ko
     * "Switch to Seller" dabana padega, aur uske liye KYC verified hona
     * zaroori hai (doc ka rule).
     *
     * Isliye service layer me rule ye hoga:
     *   roles me 'seller' add karne se pehle kycStatus === 'verified' check karo
     */
    roles: {
      type: [String],
      enum: Object.values(USER_ROLE),
      default: [USER_ROLE.BUYER],
    },

    /**
     * User abhi kis mode me website use kar raha hai. Ye sirf UI ke liye hai —
     * security ka faisla hamesha `roles` array se hoga, isse nahi.
     *
     * Yani agar koi banda API me activeRole='seller' bhej de par uske roles
     * me seller hai hi nahi, to backend usko reject karega.
     */
    activeRole: {
      type: String,
      enum: Object.values(USER_ROLE),
      default: USER_ROLE.BUYER,
    },

    // ---------------------------------------------------------------------
    // PROFILE
    // ---------------------------------------------------------------------

    // Doc kehta hai: "Customer Name as per PAN Card"
    fullName: { type: String, required: true, trim: true },

    profilePictureUrl: { type: String, trim: true },

    companyName: { type: String, trim: true },

    /**
     * GST 15 character ka hota hai. Format regex service layer ki validation
     * me check hoga (Zod/Joi se), schema me sirf basic uppercase.
     */
    gstNumber: { type: String, trim: true, uppercase: true },

    /**
     * PAN format: AAAAA0000A (5 letters, 4 digits, 1 letter)
     * Ye sensitive data hai — API response me poora PAN kabhi mat bhejiye.
     * Sirf masked dikhayiye jaise "ABCDE****F".
     */
    panNumber: { type: String, trim: true, uppercase: true, select: false },

    addresses: { type: [addressSchema], default: [] },

    // Doc ka rule: "Users can Save equipment to their Wishlist"
    wishlist: { type: [mongoose.Schema.Types.ObjectId], ref: 'Listing', default: [] },

    preferredLanguage: {
      type: String,
      enum: Object.values(LANGUAGE),
      default: LANGUAGE.ENGLISH,
    },

    // ---------------------------------------------------------------------
    // KYC — detail alag collection me, yahan sirf quick status
    // ---------------------------------------------------------------------

    /**
     * KYC ka poora record KycVerification collection me hai (documents,
     * API responses, rejection reasons wagairah).
     *
     * Par status yahan bhi copy kar ke rakh rahe hain — kyunki har bid aur
     * har listing request pe "KYC verified hai?" check karna hai. Har baar
     * do collections join karenge to performance kharab hogi.
     *
     * Ye "denormalization" hai. Rule: KycVerification update ho to ye field
     * bhi usi service call me update hogi. Kabhi alag-alag nahi.
     */
    kycStatus: {
      type: String,
      enum: Object.values(KYC_STATUS),
      default: KYC_STATUS.NOT_STARTED,
      index: true,
    },

    // ---------------------------------------------------------------------
    // WALLET (HB COINS) — sirf cache, sach hamesha ledger hai
    // ---------------------------------------------------------------------

    /**
     * ⚠️ SABSE ZAROORI COMMENT IS FILE KA ⚠️
     *
     * Ye field sirf SPEED ke liye hai — dashboard pe balance turant dikhane
     * ke liye. Ye kabhi bhi "sach" nahi hai.
     *
     * Asli balance hamesha WalletLedger collection ki saari entries ka jod
     * hoga. Ye field us jod ka cached copy hai.
     *
     * Rule:
     *   1. Ye field kabhi akela update nahi hoga — hamesha ledger entry ke
     *      saath, ek hi transaction me
     *   2. Roz raat ko ek reconciliation cron chalega jo check karega ki
     *      ye value ledger ke jod se match kar rahi hai ya nahi
     *   3. Mismatch mile to alert, aur ledger ko sach maano
     *
     * AMOUNT PAISE ME HAI, RUPAYE ME NAHI.
     * ₹20,000 = 2000000
     * Float kabhi mat use kijiye — 0.1 + 0.2 !== 0.3 hota hai JavaScript me,
     * aur financial system me ye galti bahut mehngi padti hai.
     */
    walletBalancePaise: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * Withdrawal request me locked amount. Jab user "paisa nikalna hai"
     * bolta hai, to utne coins yahan lock ho jaate hain — taaki wahi coins
     * wo auction me bhi na laga de (double spend).
     *
     * Usable balance = walletBalancePaise - lockedBalancePaise
     */
    lockedBalancePaise: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ---------------------------------------------------------------------
    // METADATA
    // ---------------------------------------------------------------------
    lastLoginAt: { type: Date },

    /**
     * Soft delete. Record kabhi physically delete nahi hoga, kyunki isse
     * jude orders, bids aur ledger entries orphan ho jaayengi.
     */
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  {
    timestamps: true, // createdAt aur updatedAt apne aap
  }
);

// -------------------------------------------------------------------------
// INDEXES
// -------------------------------------------------------------------------
// Index = database ki "index" jaisa. Bina iske MongoDB har query pe poori
// collection scan karti hai. 100 users pe farq nahi padta, 100000 pe padta hai.
//
// Rule: jis field pe aap filter ya sort karte hain, uspe index hona chahiye.
// -------------------------------------------------------------------------

// Admin panel me "sab active sellers dikhao" jaisi query ke liye
userSchema.index({ roles: 1, status: 1 });

// Admin panel me "jinka KYC pending hai" wali list ke liye
userSchema.index({ kycStatus: 1, createdAt: -1 });

// Naye users ki list (dashboard pe recent activity)
userSchema.index({ createdAt: -1 });

// -------------------------------------------------------------------------
// VIRTUAL FIELDS — DB me store nahi hote, calculate hote hain
// -------------------------------------------------------------------------

/**
 * Kitne coins abhi kharch kiye ja sakte hain.
 * Locked amount minus kar ke.
 */
userSchema.virtual('availableBalancePaise').get(function () {
  return this.walletBalancePaise - this.lockedBalancePaise;
});

/**
 * Ye user seller ka kaam kar sakta hai ya nahi.
 * Sirf roles me hona kaafi nahi — KYC bhi verified hona chahiye.
 */
userSchema.virtual('canSell').get(function () {
  // `roles` populate() projections (e.g. kyc.service.js ka 'fullName email
  // phone') me hamesha shaamil nahi hota — is virtual ko un jagah bhi
  // (crash kiye bina) safe rehna chahiye jahan sirf partial fields loaded hon.
  return (
    (this.roles || []).includes(USER_ROLE.SELLER) &&
    this.kycStatus === KYC_STATUS.VERIFIED &&
    this.status === USER_STATUS.ACTIVE
  );
});

/**
 * Ye user auction me bid kar sakta hai ya nahi.
 * (EMD paid hai ya nahi, wo alag check hai — wo auction-specific hai.)
 */
userSchema.virtual('canBid').get(function () {
  return (
    this.kycStatus === KYC_STATUS.VERIFIED &&
    this.status === USER_STATUS.ACTIVE
  );
});

// Virtuals JSON response me bhi aayein, isliye ye do lines zaroori hain
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
