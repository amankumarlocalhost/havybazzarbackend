/**
 * auctionParticipant.model.js
 * ---------------------------------------------------------------------------
 * "Kisne is auction ke liye EMD diya" ka record. Bid place karne se pehle
 * ye record `emdStatus: 'held'` me hona zaroori hai — auction.service.js
 * ka `placeBid()` sabse pehle yahi check karega.
 *
 * ⚠️ PHASE 7 STUB: Real Razorpay payment abhi connect nahi hai. Isliye
 * `joinAuction()` service function abhi EMD "hold" ko turant simulate
 * kar deta hai (jaisa listing.service.js ka sellerEmdPaid stub tha).
 * Jab Phase 7 banega, ismein ek Razorpay order create hoga aur webhook
 * confirm hone ke BAAD hi ye record banega — abhi seedha ban jaata hai.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const { EMD_STATUS } = require('../constants/enums');

const auctionParticipantSchema = new mongoose.Schema(
  {
    auctionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auction',
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    emdAmountPaise: { type: Number, required: true, min: 0 },

    emdStatus: {
      type: String,
      enum: Object.values(EMD_STATUS),
      default: EMD_STATUS.HELD,
      index: true,
    },

    // Auction close hone pe fill hoga (haara -> released, jeeta -> adjusted,
    // default kiya -> forfeited)
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

// Ek user ek auction me sirf ek baar join kar sakta hai
auctionParticipantSchema.index({ auctionId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('AuctionParticipant', auctionParticipantSchema);
