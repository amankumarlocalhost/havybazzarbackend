/**
 * wallet.service.js
 * ---------------------------------------------------------------------------
 * Ye file EK layer hai `WalletTransaction` model ke upar. Kahin bhi
 * seedha `WalletTransaction.create()` mat kariye — hamesha in functions
 * se guzariye, taaki balance-check aur locking logic ek hi jagah rahe.
 *
 * NOTE — seller ka sale-proceeds bhi isi wallet me aata hai (SALE_CREDIT
 * type se). Ye ek design decision hai: Razorpay Route (split settlement)
 * abhi client se confirm nahi hua (SCHEMA_NOTES.md), isliye seller ka
 * paisa seedha unke bank me nahi jaata — pehle in-platform wallet me
 * aata hai, phir wahi Withdrawal flow se bank me nikal sakte hain jo
 * HB Coins ke liye bhi use hota hai. Jab Route confirm ho, seller
 * proceeds ko seedha split-settle karna alag se implement karna padega.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const WalletTransaction = require('../models/walletTransaction.model');
const AppError = require('../utils/AppError');
const { WALLET_TXN_TYPE } = require('../constants/enums');

/**
 * Balance hamesha ledger ke SUM se nikalta hai — kabhi kisi field me
 * cache/store nahi hoti (SCHEMA_NOTES.md ka rule).
 */
async function getBalance(userId, session) {
  const query = WalletTransaction.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        balance: {
          $sum: {
            $cond: [{ $eq: ['$direction', 'credit'] }, '$amountPaise', { $multiply: ['$amountPaise', -1] }],
          },
        },
      },
    },
  ]);

  const result = session ? await query.session(session) : await query;
  return result.length > 0 ? result[0].balance : 0;
}

async function credit({ userId, type, amountPaise, referenceType, referenceId, description, session }) {
  const [txn] = await WalletTransaction.create(
    [{ userId, type, direction: 'credit', amountPaise, referenceType, referenceId, description }],
    { session }
  );
  return txn;
}

/**
 * Debit se PEHLE balance check karta hai — negative balance kabhi nahi
 * banna chahiye. `session` pass karna zaroori hai jab caller transaction
 * ke andar ho (jaise withdrawal request), warna concurrent debits me
 * balance galat ho sakta hai.
 */
async function debit({ userId, type, amountPaise, referenceType, referenceId, description, session }) {
  const currentBalance = await getBalance(userId, session);
  if (currentBalance < amountPaise) {
    throw new AppError('Insufficient wallet balance.', 400);
  }

  const [txn] = await WalletTransaction.create(
    [{ userId, type, direction: 'debit', amountPaise, referenceType, referenceId, description }],
    { session }
  );
  return txn;
}

// ---- Convenience wrappers — semantic naming, service layer ke liye ----

async function creditFromEmdRelease(userId, amountPaise, auctionId, session) {
  return credit({
    userId,
    type: WALLET_TXN_TYPE.COIN_CREDIT,
    amountPaise,
    referenceType: 'Auction',
    referenceId: auctionId,
    description: 'EMD refund after losing auction — HB Coins',
    session,
  });
}

async function creditSaleProceeds(userId, amountPaise, orderId, session) {
  return credit({
    userId,
    type: WALLET_TXN_TYPE.SALE_CREDIT,
    amountPaise,
    referenceType: 'Order',
    referenceId: orderId,
    description: 'Sale proceeds (after commission)',
    session,
  });
}

async function debitForWithdrawal(userId, amountPaise, withdrawalId, session) {
  return debit({
    userId,
    type: WALLET_TXN_TYPE.COIN_DEBIT,
    amountPaise,
    referenceType: 'Withdrawal',
    referenceId: withdrawalId,
    description: 'Withdrawal request — coins locked',
    session,
  });
}

async function creditWithdrawalReversal(userId, amountPaise, withdrawalId, session) {
  return credit({
    userId,
    type: WALLET_TXN_TYPE.COIN_CREDIT,
    amountPaise,
    referenceType: 'Withdrawal',
    referenceId: withdrawalId,
    description: 'Withdrawal rejected — coins refunded',
    session,
  });
}

async function getHistory(userId, { page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  const [items, total, balance] = await Promise.all([
    WalletTransaction.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    WalletTransaction.countDocuments({ userId }),
    getBalance(userId),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit), currentBalancePaise: balance };
}

module.exports = {
  getBalance,
  credit,
  debit,
  creditFromEmdRelease,
  creditSaleProceeds,
  debitForWithdrawal,
  creditWithdrawalReversal,
  getHistory,
};
