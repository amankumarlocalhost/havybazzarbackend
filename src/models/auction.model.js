/**
 * auction.model.js
 * ---------------------------------------------------------------------------
 * Listing se ALAG collection hai (jaisa listing.model.js me explain kiya
 * tha) — kyunki har bid pe ye document update hota hai, aur listing ka
 * bhaari data (specs, media) baar-baar rewrite nahi hona chahiye.
 *
 * IMPORTANT — EMD amount ka assumption (SCHEMA_NOTES.md ka open sawal):
 * Doc me contradiction hai ki EMD kis amount pe calculate hoga. Maine
 * "startingBidPaise" ko base maana hai — ye is file ke `emdAmountPaise`
 * field ke comment me bhi likha hai. Client confirm kare to sirf
 * `auction.service.js` ke `createAuctionDraft()` me ek line badlegi.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const { AUCTION_STATUS } = require('../constants/enums');

const auctionSchema = new mongoose.Schema(
  {
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      required: true,
      unique: true,
      index: true,
    },

    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(AUCTION_STATUS),
      default: AUCTION_STATUS.SCHEDULED,
      index: true,
    },

    // ---------------------------------------------------------------------
    // BIDDING PARAMETERS — seller set karta hai listing banate waqt
    // ---------------------------------------------------------------------
    startingBidPaise: { type: Number, required: true, min: 0 },
    minIncrementPaise: { type: Number, required: true, min: 1 },
    reservePricePaise: { type: Number, min: 0 }, // optional — na mile to auction cancel

    // ---------------------------------------------------------------------
    // CURRENT STATE — har bid pe update hota hai
    // ---------------------------------------------------------------------
    currentHighestBidPaise: { type: Number, default: null },
    currentLeaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    totalBidsCount: { type: Number, default: 0 },

    // ---------------------------------------------------------------------
    // TIMING — anti-sniping extensions ke saath
    // ---------------------------------------------------------------------
    startTime: { type: Date, required: true },
    originalEndTime: { type: Date, required: true }, // kabhi nahi badlega, reference ke liye
    endTime: { type: Date, required: true },          // extend hone pe ye badhega
    extensionCount: { type: Number, default: 0 },

    // ---------------------------------------------------------------------
    // EMD — buyer ko bidding se pehle dena hai
    // ---------------------------------------------------------------------

    /**
     * Buyer EMD amount — startingBidPaise ka BUSINESS_RULES.EMD_BPS_BUYER
     * (2%) hissa. Ye SCHEMA_NOTES.md ka wahi khula sawal hai, defensible
     * default ke saath. `auction.service.js` me calculateEmdAmountPaise()
     * se compute hota hai.
     */
    emdAmountPaise: { type: Number, required: true, min: 0 },

    // ---------------------------------------------------------------------
    // RESULT — closing pe fill hota hai
    // ---------------------------------------------------------------------
    winnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    winningBidPaise: { type: Number },
    closedAt: { type: Date },

    /**
     * Kyun close hua — winner mil gaya, reserve nahi mila, ya koi bid
     * hi nahi aayi. Admin/buyer ko dikhane ke liye.
     */
    closeReason: { type: String, trim: true },
  },
  { timestamps: true }
);

// -------------------------------------------------------------------------
// INDEXES
// -------------------------------------------------------------------------

// BullMQ reconciliation cron: "sab LIVE auctions jinka endTime nikal chuka"
auctionSchema.index({ status: 1, endTime: 1 });

// BullMQ start job backup: "sab SCHEDULED auctions jinka startTime aa gaya"
auctionSchema.index({ status: 1, startTime: 1 });

module.exports = mongoose.model('Auction', auctionSchema);
