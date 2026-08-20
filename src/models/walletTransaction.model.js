/**
 * walletTransaction.model.js
 * ---------------------------------------------------------------------------
 * LEDGER — poore payment system ka dil. Rules (jo maine chat me pehle
 * explain kiye the, ab code me hain):
 *
 *   1. APPEND-ONLY — ek entry ban gayi to kabhi update/delete nahi hoti.
 *      Galti ho jaaye to REVERSAL entry daalo (negative amount se), purani
 *      mitao mat.
 *   2. Balance kahin FIELD me store NAHI hota. Balance hamesha
 *      `wallet.service.js` ke `getBalance()` se, is collection ke SUM se
 *      nikalta hai. Isse "mera paisa kahan gaya" ka poora sawaal-jawab
 *      hamesha ledger se milta hai.
 *   3. Amount hamesha PAISE me, integer. Float kabhi nahi.
 *   4. `direction` (credit/debit) alag field hai taaki balance query
 *      simple ho: SUM(amount * (direction === 'credit' ? 1 : -1))
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const { WALLET_TXN_TYPE } = require('../constants/enums');

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: Object.values(WALLET_TXN_TYPE),
      required: true,
    },

    direction: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },

    amountPaise: { type: Number, required: true, min: 0 },

    // Kis cheez ki wajah se ye entry bani — auction, order, withdrawal
    referenceType: { type: String, enum: ['Auction', 'Order', 'Withdrawal'], required: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId, required: true },

    description: { type: String, trim: true },
  },
  {
    // updatedAt nahi chahiye — ledger entry kabhi update hi nahi hoti
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// "Mera poora wallet history" aur "balance nikalo" — dono isi index se fast
walletTransactionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
