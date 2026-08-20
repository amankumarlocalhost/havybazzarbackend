/**
 * paymentOrder.model.js
 * ---------------------------------------------------------------------------
 * Har baar jab Razorpay order banta hai (EMD ho, final payment ho, fixed
 * price purchase ho), ek record yahan banta hai. Webhook aane pe isi
 * record ka status update hota hai — aur agar wahi webhook DOBARA aaye
 * (Razorpay retry karta hai), `razorpayPaymentId` ka unique index
 * duplicate processing rokta hai (idempotency).
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const { PAYMENT_PURPOSE, PAYMENT_STATUS } = require('../constants/enums');

const paymentOrderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    purpose: { type: String, enum: Object.values(PAYMENT_PURPOSE), required: true },

    // Kis auction/listing/order ke liye — purpose ke hisaab se referenceType badalta hai
    referenceType: { type: String, enum: ['Auction', 'Listing', 'Order'], required: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId, required: true },

    amountPaise: { type: Number, required: true, min: 0 },

    razorpayOrderId: { type: String, required: true, unique: true, index: true },

    /**
     * Webhook confirm hone ke baad fill hota hai. UNIQUE + SPARSE —
     * sparse isliye kyunki payment fail/pending state me ye field
     * exist hi nahi karega, aur do null values ek unique index me
     * clash nahi karni chahiye.
     */
    razorpayPaymentId: { type: String, unique: true, sparse: true, index: true },

    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.CREATED,
      index: true,
    },

    paidAt: { type: Date },
    failureReason: { type: String, trim: true },

    // Sirf FIXED_PRICE_PURCHASE aur AUCTION_FINAL_PAYMENT purposes ke
    // liye — checkout ke waqt "T&C accept karta hoon" checkbox
    termsAcceptedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentOrder', paymentOrderSchema);
