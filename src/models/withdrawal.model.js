/**
 * withdrawal.model.js
 * ---------------------------------------------------------------------------
 * User apne HB Coins bank me nikalna chahta hai. Request banate hi coins
 * LOCK ho jaate hain (ledger me COIN_DEBIT entry turant ban jaati hai) —
 * warna user request daal ke wahi coins kisi auction ke EMD me bhi laga
 * sakta hai (double-spend). Admin reject kare to coins wapas credit
 * honge (naya reversal entry).
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const { WITHDRAWAL_STATUS } = require('../constants/enums');

const withdrawalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    amountPaise: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: Object.values(WITHDRAWAL_STATUS),
      default: WITHDRAWAL_STATUS.PENDING,
      index: true,
    },

    // Bank details — abhi simple text fields (payout gateway integration
    // Phase 7 ke scope se bahar hai, doc me bhi iske exact details nahi hain)
    bankAccountNumber: { type: String, trim: true },
    bankIfsc: { type: String, trim: true },

    reviewedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
