/**
 * category.model.js
 * ---------------------------------------------------------------------------
 * Equipment categories — Excavators, Cranes, Loaders wagairah.
 * Sirf admin inhe bana sakta hai (doc ka rule). Seller apni marzi ki
 * category nahi bana sakta, sirf list me se choose kar sakta hai.
 *
 * Nesting: doc kehta hai "categories and subcategories" — yani 2 level.
 * Isliye simple parent reference kaafi hai, koi complex tree structure
 * ki zaroorat nahi.
 *
 *   Construction Equipment (parent = null)
 *     └── Excavators (parent = Construction Equipment ki id)
 *     └── Loaders
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const { LANGUAGE } = require('../constants/enums');

/**
 * Localized naam. Doc kehta hai localization sirf static content pe hoga —
 * English, Hindi, Assamese.
 *
 * Category naam static content hai (admin ne set kiya, roz nahi badalta),
 * isliye ye teeno languages me store hoga.
 */
const localizedNameSchema = new mongoose.Schema(
  {
    [LANGUAGE.ENGLISH]: { type: String, required: true, trim: true },
    [LANGUAGE.HINDI]: { type: String, trim: true },
    [LANGUAGE.ASSAMESE]: { type: String, trim: true },
  },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: localizedNameSchema, required: true },

    /**
     * URL-friendly naam: "construction-equipment".
     * Ye unique hoga aur URLs me use hoga, id ki jagah.
     * SEO ke liye behtar hai aur user ko samajh bhi aata hai.
     */
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    /**
     * Parent category. `null` matlab ye top-level category hai.
     *
     * Rule: sirf 2 level allowed hain. Yani agar parentId set hai, to us
     * parent ka apna parentId null hona chahiye. Ye validation service
     * layer me hogi — schema level pe recursion check clean nahi likha jaata.
     */
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true,
    },

    description: { type: String, trim: true },

    // Category ka icon ya banner image (Cloudinary public_id)
    imageKey: { type: String, trim: true },

    /**
     * Homepage pe kis order me dikhega. Chhota number pehle.
     * Admin drag-and-drop se ise badal sakta hai.
     */
    displayOrder: { type: Number, default: 0 },

    /**
     * Category band karni ho to isko false kar do.
     * Delete mat kijiye — kyunki purani listings isse judi hain.
     * Inactive category naye listings me nahi dikhegi, par purani
     * listings tooti nahi.
     */
    isActive: { type: Boolean, default: true, index: true },

    /**
     * Kitni active listings hain is category me.
     *
     * Ye bhi cache hai — har baar count query chalane se bacha jaata hai.
     * Listing active/inactive hone pe ye update hoga, aur roz raat ko
     * ek cron isko recalculate karega.
     */
    listingCount: { type: Number, default: 0 },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// -------------------------------------------------------------------------
// INDEXES
// -------------------------------------------------------------------------

// Homepage: "sab active top-level categories, order ke hisaab se"
categorySchema.index({ parentId: 1, isActive: 1, displayOrder: 1 });

module.exports = mongoose.model('Category', categorySchema);
