/**
 * listing.model.js
 * ---------------------------------------------------------------------------
 * Ye sabse bada model hai. Ek listing = ek equipment jo seller ne daala.
 *
 * DESIGN DECISION: specs ko embedded rakha hai, alag collection nahi banayi.
 *
 * Kyun? Kyunki specs hamesha listing ke saath hi padhi jaati hain — koi
 * kabhi "sab engines dikhao" jaisi query nahi karega. MongoDB me jo cheezein
 * saath padhi jaati hain unhe saath rakhna hi sahi hai. Alag collection
 * banate to har listing page pe ek extra join lagta.
 *
 * DESIGN DECISION 2: auction ka data yahan NAHI hai, alag Auction collection
 * me hoga.
 *
 * Kyun? Kyunki auction me har second bid update hoti hai. Agar wo isi
 * document me hota, to har bid pe ye poora bhaari document (specs, media,
 * sab) rewrite hota. Alag rakhne se auction document chhota aur tez rehta hai.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const {
  LISTING_STATUS,
  LISTING_TYPE,
  EQUIPMENT_CONDITION,
  MEDIA_TYPE,
} = require('../constants/enums');

/**
 * Uploaded photo/video/document.
 * fileKey Cloudinary ka public_id hai — poora URL response banate waqt generate hoga.
 */
const mediaSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: Object.values(MEDIA_TYPE),
      required: true,
    },
    fileKey: { type: String, required: true, trim: true },
    thumbnailKey: { type: String, trim: true }, // video ke liye
    displayOrder: { type: Number, default: 0 },
    caption: { type: String, trim: true },
  },
  { _id: true }
);

/**
 * Equipment ke specs. Doc me ye 5 groups me diye gaye hain.
 *
 * Sab fields optional hain kyunki har equipment me har spec nahi hoti —
 * ek crane me "tracks width" nahi hoti, ek excavator me hoti hai.
 * Required validation category ke hisaab se service layer me hogi.
 */
const specificationsSchema = new mongoose.Schema(
  {
    // ------------------- GENERAL -------------------
    general: {
      referenceNumber: { type: String, trim: true },  // "70272106"
      brand: { type: String, trim: true, index: true }, // "Hitachi"
      type: { type: String, trim: true },             // "ZX19"
      typeExtended: { type: String, trim: true },     // "ZX19-6 CR"

      /**
       * Production year. Doc ka rule: 5 saal se purana equipment list
       * nahi ho sakta. Ye validation service layer me hogi kyunki
       * "aaj se 5 saal" har din badalta hai — schema me hardcode nahi
       * kar sakte.
       */
      productionYear: { type: Number, index: true },

      /**
       * Kitne ghante chala hai. Doc ka rule: max 10-15k.
       * TODO: exact number client se confirm karna hai.
       */
      hoursOnMeter: { type: Number, index: true },

      totalWeightKg: { type: Number },

      /**
       * Serial number sensitive hai — ye API response me sirf seller aur
       * admin ko dikhega, aam buyer ko nahi.
       */
      serialNumber: { type: String, trim: true, select: false },
    },

    // ------------------- ENGINE -------------------
    engine: {
      brand: { type: String, trim: true },      // "Yanmar"
      type: { type: String, trim: true },       // "3TNV70-P"
      cylinderCount: { type: Number },
    },

    // ------------------- HYDRAULIC -------------------
    hydraulic: {
      systemType: { type: String, trim: true },       // "Shear and clamp (MP)"
      quickCouplerBrand: { type: String, trim: true }, // "SMP"
      quickCouplerType: { type: String, trim: true },  // "S30 HA"
    },

    // ------------------- CABIN -------------------
    cabin: {
      hasAirSuspensionSeat: { type: Boolean, default: false },
      hasAirConditioning: { type: Boolean, default: false },
    },

    // ------------------- UNDERCARRIAGE -------------------
    undercarriage: {
      shoesWidthMm: { type: Number },
      tracksWidthMm: { type: Number },
    },
  },
  { _id: false }
);

const listingSchema = new mongoose.Schema(
  {
    // ---------------------------------------------------------------------
    // OWNERSHIP
    // ---------------------------------------------------------------------
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ---------------------------------------------------------------------
    // BASIC INFO
    // ---------------------------------------------------------------------
    title: { type: String, required: true, trim: true }, // "Hitachi ZX19-6 CR"

    slug: { type: String, unique: true, lowercase: true, trim: true, index: true },

    description: { type: String, trim: true },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },

    condition: {
      type: String,
      enum: Object.values(EQUIPMENT_CONDITION),
    },

    // ---------------------------------------------------------------------
    // LOCATION — doc kehta hai STATE level pe, city pe nahi
    // ---------------------------------------------------------------------
    location: {
      state: { type: String, required: true, trim: true, index: true },
      city: { type: String, trim: true },  // store karenge par filter nahi karenge
      country: { type: String, default: 'India', trim: true },
    },

    // ---------------------------------------------------------------------
    // ⚠️ HIDDEN FIELD — doc ka explicit rule
    // ---------------------------------------------------------------------

    /**
     * "Note: The Vehicle Registration Number should not be displayed."
     *
     * Isliye `select: false` — ye field kabhi apne aap API response me
     * nahi aayega. Agar admin ko chahiye to explicitly select karna padega.
     *
     * Ye do-layer protection hai: schema level pe select:false, aur
     * response serializer me bhi explicitly hataya jaayega.
     */
    vehicleRegistrationNumber: { type: String, trim: true, select: false },

    // ---------------------------------------------------------------------
    // SPECS AND MEDIA
    // ---------------------------------------------------------------------
    specifications: { type: specificationsSchema, default: () => ({}) },

    media: { type: [mediaSchema], default: [] },

    /**
     * Inspection report — doc me alag module hai.
     * PDF Cloudinary pe hoga (public — shareable), aur user isko WhatsApp pe share kar sakta hai.
     */
    inspectionReport: {
      fileKey: { type: String, trim: true },
      uploadedAt: { type: Date },
      notes: { type: String, trim: true },
    },

    // ---------------------------------------------------------------------
    // SELLING MODE
    // ---------------------------------------------------------------------
    listingType: {
      type: String,
      enum: Object.values(LISTING_TYPE),
      required: true,
      index: true,
    },

    /**
     * Fixed price mode me hi kaam ka. AMOUNT PAISE ME.
     * ₹12,00,000 = 120000000
     *
     * Auction mode me ye null rahega — starting bid Auction collection
     * me hoga.
     */
    fixedPricePaise: { type: Number, min: 0 },

    /**
     * Sirf FIXED_PRICE listings ke liye — seller ke paas is equipment ki
     * kitni units hain (jaise same model ke 5 excavators). Auction hamesha
     * ek-hi-item hota hai, isliye wahan ye field use nahi hoti.
     *
     * `totalQuantity` seller ne jitna daala tha (fixed rehta hai, display
     * ke liye "3 of 5 available" jaisa). `quantityAvailable` har purchase
     * pe 1 se kam hota hai — jab 0 ho jaaye tabhi listing SOLD maani
     * jaati hai aur website se hat jaati hai (isse pehle tak active
     * rehti hai, chahe kuch units bik chuki hon).
     */
    totalQuantity: { type: Number, min: 1, default: 1 },
    quantityAvailable: { type: Number, min: 0, default: 1 },

    /**
     * Agar auction hai to us auction ka reference.
     * Ye do-taraffa link hai — Auction me bhi listingId hoga.
     * Thoda duplicate hai par dono taraf se query fast ho jaati hai.
     */
    auctionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auction',
      index: true,
      sparse: true,
    },

    // ---------------------------------------------------------------------
    // STATUS — poori state machine
    // ---------------------------------------------------------------------
    status: {
      type: String,
      enum: Object.values(LISTING_STATUS),
      default: LISTING_STATUS.DRAFT,
      index: true,
    },

    submittedForReviewAt: { type: Date },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, trim: true },

    reviewedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    },

    /**
     * Auction listing ke liye seller ne EMD diya ya nahi.
     * Doc: "At the time of publishing the product for Auction, the seller
     * is required to pay the EMD amount"
     */
    sellerEmdPaid: { type: Boolean, default: false },
    sellerEmdAmountPaise: { type: Number, min: 0 },

    // ---------------------------------------------------------------------
    // ANALYTICS — doc me "Views per Listing" wala module
    // ---------------------------------------------------------------------

    /**
     * Ye counter atomic increment se badhega ($inc), read-modify-write se
     * nahi. Warna do log ek saath dekhen to ek view kho jaayega.
     *
     * Aage chal ke agar traffic zyada ho to isko Redis me count karke
     * har 5 minute me DB me flush kar sakte hain.
     */
    viewCount: { type: Number, default: 0 },

    wishlistCount: { type: Number, default: 0 },

    // ---------------------------------------------------------------------
    // SOFT DELETE
    // ---------------------------------------------------------------------
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

// -------------------------------------------------------------------------
// INDEXES — ye performance ke liye critical hain
// -------------------------------------------------------------------------

/**
 * Sabse common query: "is category me, is state me, active listings dikhao,
 * naye pehle"
 *
 * Compound index ka order important hai: equality filters pehle,
 * range/sort last. Isliye status, categoryId, state pehle — createdAt baad me.
 */
listingSchema.index({ status: 1, categoryId: 1, 'location.state': 1, createdAt: -1 });

// Buy Now vs Auction tab ke liye
listingSchema.index({ status: 1, listingType: 1, createdAt: -1 });

// Price se sort karne ke liye
listingSchema.index({ status: 1, fixedPricePaise: 1 });

// Seller dashboard: "meri sab listings"
listingSchema.index({ sellerId: 1, status: 1, createdAt: -1 });

// Admin panel: "sab pending review, purani pehle"
listingSchema.index({ status: 1, submittedForReviewAt: 1 });

// Featured/popular listings (most viewed)
listingSchema.index({ status: 1, viewCount: -1 });

/**
 * Text search index — search bar ke liye.
 *
 * `weights` batata hai ki kis field ko zyada importance deni hai.
 * Title me match hona description me match hone se zyada relevant hai.
 *
 * NOTE: MongoDB ka built-in text search theek hai par bahut powerful nahi.
 * Agar client ko fuzzy search, typo tolerance, ya advanced relevance chahiye
 * to aage chal ke Atlas Search ya Elasticsearch lagana padega.
 */
listingSchema.index(
  {
    title: 'text',
    description: 'text',
    'specifications.general.brand': 'text',
    'specifications.general.typeExtended': 'text',
  },
  {
    weights: {
      title: 10,
      'specifications.general.brand': 5,
      'specifications.general.typeExtended': 5,
      description: 1,
    },
    name: 'listing_text_search',
  }
);

// -------------------------------------------------------------------------
// VIRTUALS
// -------------------------------------------------------------------------

/**
 * Ye listing abhi public ko dikhni chahiye ya nahi.
 */
listingSchema.virtual('isPubliclyVisible').get(function () {
  return this.status === LISTING_STATUS.ACTIVE && !this.isDeleted;
});

listingSchema.set('toJSON', { virtuals: true });
listingSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Listing', listingSchema);
