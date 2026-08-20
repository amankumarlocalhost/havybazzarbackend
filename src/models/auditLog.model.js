/**
 * auditLog.model.js
 * ---------------------------------------------------------------------------
 * Har admin action ka record: kisne, kab, kya kiya, aur kya badla.
 *
 * Ye collection APPEND-ONLY hai. Entries kabhi update ya delete nahi hongi.
 * Code me bhi koi update/delete method nahi hoga — sirf create.
 *
 * Kyun zaroori hai:
 *   - Seller: "meri listing kisne delete ki?" -> jawab yahan hai
 *   - Sub-admin ne galti se 50 accounts block kar diye -> pata chalega kisne
 *   - Financial actions (EMD forfeit, withdrawal approve) ka legal record
 *   - Kal koi sub-admin gadbad kare to proof
 *
 * Ye chhota sa model hai par project ka insurance hai.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const { AUDIT_ACTION } = require('../constants/enums');

const auditLogSchema = new mongoose.Schema(
  {
    // -------------------------------------------------------------------
    // KISNE KIYA
    // -------------------------------------------------------------------
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: true,
      index: true,
    },

    /**
     * Admin ka naam aur email yahan COPY kar ke rakh rahe hain.
     *
     * "Par ye to AdminUser me already hai, duplicate kyun?"
     *
     * Kyunki agar kal wo admin delete ho gaya ya uska naam badal gaya,
     * to purana log padhne pe aapko pata hona chahiye ki us WAQT kaun tha.
     * Audit log ka pura point hi yahi hai — us samay ka sach.
     *
     * Isko "snapshot" pattern kehte hain. Audit aur invoice jaisi jagah
     * pe ye zaroori hai.
     */
    adminEmail: { type: String, required: true, trim: true },
    adminName: { type: String, trim: true },

    // -------------------------------------------------------------------
    // KYA KIYA
    // -------------------------------------------------------------------
    action: {
      type: String,
      enum: Object.values(AUDIT_ACTION),
      required: true,
      index: true,
    },

    /**
     * Kis cheez pe action hua.
     * targetType: "Listing", "User", "Category", "Withdrawal"
     * targetId: us document ki id
     */
    targetType: { type: String, required: true, trim: true, index: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, index: true },

    // Target ka naam bhi snapshot me — "Hitachi ZX19-6 CR"
    targetLabel: { type: String, trim: true },

    // -------------------------------------------------------------------
    // KYA BADLA
    // -------------------------------------------------------------------

    /**
     * Sirf badle hue fields store karo, poora document nahi.
     *
     * Example:
     *   before: { status: "under_review" }
     *   after:  { status: "approved" }
     *
     * Poora document store karenge to ye collection bahut jaldi bhaari
     * ho jaayegi. Sirf diff kaafi hai.
     *
     * ⚠️ WARNING: yahan kabhi passwordHash, PAN number, ya koi bhi
     * sensitive field mat daaliye. Audit log ko baad me export bhi kiya
     * ja sakta hai.
     */
    changesBefore: { type: mongoose.Schema.Types.Mixed },
    changesAfter: { type: mongoose.Schema.Types.Mixed },

    // Admin ne reject/suspend karte waqt kya reason likha
    reason: { type: String, trim: true },

    // -------------------------------------------------------------------
    // CONTEXT
    // -------------------------------------------------------------------
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true },
  },
  {
    /**
     * `updatedAt` nahi chahiye — kyunki ye records kabhi update hi nahi honge.
     * Sirf createdAt.
     */
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// -------------------------------------------------------------------------
// INDEXES
// -------------------------------------------------------------------------

// "Is admin ne kya kya kiya" — latest pehle
auditLogSchema.index({ adminId: 1, createdAt: -1 });

// "Is listing pe kya kya hua" — seller ke sawal ka jawab
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

// "Aaj kya kya hua" — admin dashboard ka activity feed
auditLogSchema.index({ createdAt: -1 });

/**
 * ⚠️ IMPORTANT: yahan TTL index MAT lagayiye.
 *
 * TTL index purane records apne aap delete kar deta hai. Financial audit
 * logs ko saalon tak rakhna hota hai (legal requirement).
 *
 * Agar collection bahut badi ho jaaye to purane logs ko archive collection
 * ya cold storage me move kar dijiye — par delete kabhi mat kijiye.
 */

module.exports = mongoose.model('AuditLog', auditLogSchema);
