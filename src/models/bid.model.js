/**
 * bid.model.js
 * ---------------------------------------------------------------------------
 * APPEND-ONLY. Ek bid ek baar ban gayi to kabhi update ya delete nahi
 * hoti — auction ki poori history yahi document banate hain.
 *
 * Code me bhi koi `updateOne`/`findOneAndUpdate` is model pe kahin nahi
 * hoga (auction.service.js me bhi nahi) — sirf `create()`.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema(
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

    amountPaise: { type: Number, required: true, min: 0 },

    /**
     * Ye bid user ne khud typed ki, ya auto-bid engine ne unki taraf se
     * automatically place ki (jab koi doosra unke max se kam pe bid kare).
     *
     * User ko dikhane ke liye zaroori hai — taaki wo samajh sake "ye
     * mera manual bid tha" vs "ye system ne mere auto-bid se lagaya".
     */
    isAutoBid: { type: Boolean, default: false },
  },
  {
    // updatedAt nahi chahiye — bid kabhi update hi nahi hoti
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Auction ki bid history dikhane ke liye — latest pehle
bidSchema.index({ auctionId: 1, createdAt: -1 });

// "Meri sab bids" — buyer ke My Bids section ke liye
bidSchema.index({ bidderId: 1, createdAt: -1 });

module.exports = mongoose.model('Bid', bidSchema);
