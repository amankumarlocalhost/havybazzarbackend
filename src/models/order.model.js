/**
 * order.model.js
 * ---------------------------------------------------------------------------
 * Doc ka "My Account -> Orders" aur "Seller -> Orders" dono modules yahi
 * data use karenge.
 *
 * Address SNAPSHOT hai (user ke current address ka reference nahi) —
 * SCHEMA_NOTES.md ka rule: user baad me apna address badal de to purana
 * order na badle.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const { ORDER_STATUS } = require('../constants/enums');

const addressSnapshotSchema = new mongoose.Schema(
  {
    line1: String,
    line2: String,
    city: String,
    state: String,
    country: String,
    pincode: String,
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true }, // "HB-2026-000123"

    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },

    orderType: { type: String, enum: ['auction_win', 'fixed_price'], required: true },

    // Poora amount jo buyer ne diya (EMD adjust hone ke baad bhi total price yahi rahega)
    totalAmountPaise: { type: Number, required: true },
    emdAdjustedPaise: { type: Number, default: 0 }, // auction order me EMD jo adjust hua
    commissionPaise: { type: Number, required: true }, // admin ka 1%+1% se jo bhi is order pe laga

    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PROCESSING,
      index: true,
    },

    shippingAddress: { type: addressSnapshotSchema, required: true },

    invoiceNumber: { type: String, unique: true, sparse: true },
    invoiceGeneratedAt: { type: Date },

    /**
     * LEGAL AGREEMENT — doc ka rule: "buyer directed to sign the
     * agreement... integrated Legality API". Vendor abhi tak client se
     * confirm nahi hua (jaisa KYC me bhi tha). Isliye abhi ye ek SIMPLE
     * ACCEPTANCE record hai — checkout ke waqt buyer ek checkbox tick
     * karta hai "T&C padh liye, maanta hoon" — timestamp store hota hai.
     * Jab vendor mile (jaise Digio/Leegality), poora e-sign document
     * flow isi field ke bagal me add hoga, ye replace nahi hoga
     * (purane orders ka simple-acceptance record valid rahega).
     */
    termsAcceptedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
