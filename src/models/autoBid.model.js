/**
 * autoBid.model.js
 * ---------------------------------------------------------------------------
 * User ka "max amount" jo wo auction ke liye dena tayyar hai. Ek user
 * ka ek auction me sirf EK active auto-bid ho sakta hai — isliye unique
 * compound index.
 *
 * Ye Bid model se ALAG hai: Bid = "kya bid actually lagi", AutoBid =
 * "kitna tak jaane ko tayyar hai" (jo kabhi public nahi hota — auto-bid
 * resolution ke through hi asar dikhata hai).
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');

const autoBidSchema = new mongoose.Schema(
  {
    auctionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auction',
      required: true,
      index: true,
    },

    bidderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    /**
     * User ka max — kabhi kisi doosre user ko response me nahi dikhega,
     * sirf khud bidder ko. `auctionMath.resolveAuctionState()` isko
     * consume karta hai par kabhi expose nahi karta.
     */
    maxAmountPaise: { type: Number, required: true, min: 0 },

    /**
     * User apna auto-bid "band" kar sakta hai bina delete kiye — history
     * ke liye rakhna behtar hai (soft-off pattern, jaisa baaki models me).
     */
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Ek user ka ek auction me sirf ek auto-bid
autoBidSchema.index({ auctionId: 1, bidderId: 1 }, { unique: true });

module.exports = mongoose.model('AutoBid', autoBidSchema);
