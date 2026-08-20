const Withdrawal = require('../models/withdrawal.model');
const AppError = require('../utils/AppError');
const walletService = require('./wallet.service');
const { logAdminAction } = require('./auditLog.service');
const { WITHDRAWAL_STATUS, AUDIT_ACTION } = require('../constants/enums');
const mongoose = require('mongoose');

const MIN_WITHDRAWAL_PAISE = 10000; // ₹100 — chhote amounts ke liye payout fees hi zyada lagegi

async function requestWithdrawal(userId, amountPaise, bankDetails) {
  if (amountPaise < MIN_WITHDRAWAL_PAISE) {
    throw new AppError(`Minimum withdrawal is Rs ${MIN_WITHDRAWAL_PAISE / 100}.`, 400);
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // Coins TURANT lock — warna user isi paise se ek auction EMD bhi
    // de sakta hai (double-spend). Debit hote hi balance kam ho jaata hai.
    const withdrawal = await Withdrawal.create(
      [
        {
          userId,
          amountPaise,
          status: WITHDRAWAL_STATUS.PENDING,
          bankAccountNumber: bankDetails.bankAccountNumber,
          bankIfsc: bankDetails.bankIfsc,
        },
      ],
      { session }
    );

    await walletService.debitForWithdrawal(userId, amountPaise, withdrawal[0]._id, session);

    await session.commitTransaction();
    session.endSession();

    return withdrawal[0];
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    throw err;
  }
}

async function adminListPending({ page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Withdrawal.find({ status: WITHDRAWAL_STATUS.PENDING })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'fullName email phone'),
    Withdrawal.countDocuments({ status: WITHDRAWAL_STATUS.PENDING }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Approve — coins already locked (debit ho chuke the request ke waqt),
 * ab bas status change hota hai. Real bank transfer (Razorpay Payout
 * API) is phase ke scope se bahar hai — abhi admin manually bank
 * transfer karega aur yahan "approved" mark karega.
 */
async function approve(withdrawalId, adminInfo) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw new AppError('Withdrawal request not found.', 404);
  if (withdrawal.status !== WITHDRAWAL_STATUS.PENDING) {
    throw new AppError(`This request is in "${withdrawal.status}" state.`, 400);
  }

  withdrawal.status = WITHDRAWAL_STATUS.APPROVED;
  withdrawal.reviewedByAdminId = adminInfo.adminId;
  withdrawal.reviewedAt = new Date();
  await withdrawal.save();

  await logAdminAction({
    adminId: adminInfo.adminId,
    adminName: adminInfo.fullName,
    adminEmail: adminInfo.email,
    action: AUDIT_ACTION.WITHDRAWAL_APPROVED,
    targetType: 'Withdrawal',
    targetId: withdrawal._id,
    targetLabel: `Rs ${withdrawal.amountPaise / 100}`,
  });

  const notificationService = require('./notification.service');
  await notificationService.notify(withdrawal.userId, 'withdrawal_approved', {
    amountPaise: withdrawal.amountPaise,
  });

  return withdrawal;
}

/**
 * Reject — coins WAPAS credit hote hain (reversal entry, purani entry
 * mitai nahi jaati — ledger ka rule).
 */
async function reject(withdrawalId, adminInfo, reason) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw new AppError('Withdrawal request not found.', 404);
  if (withdrawal.status !== WITHDRAWAL_STATUS.PENDING) {
    throw new AppError(`This request is in "${withdrawal.status}" state.`, 400);
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    withdrawal.status = WITHDRAWAL_STATUS.REJECTED;
    withdrawal.reviewedByAdminId = adminInfo.adminId;
    withdrawal.reviewedAt = new Date();
    withdrawal.rejectionReason = reason;
    await withdrawal.save({ session });

    await walletService.creditWithdrawalReversal(withdrawal.userId, withdrawal.amountPaise, withdrawal._id, session);

    await session.commitTransaction();
    session.endSession();

    await logAdminAction({
      adminId: adminInfo.adminId,
      adminName: adminInfo.fullName,
      adminEmail: adminInfo.email,
      action: AUDIT_ACTION.WITHDRAWAL_REJECTED,
      targetType: 'Withdrawal',
      targetId: withdrawal._id,
      targetLabel: `Rs ${withdrawal.amountPaise / 100}`,
      reason,
    });

    const notificationService = require('./notification.service');
    await notificationService.notify(withdrawal.userId, 'withdrawal_rejected', {
      amountPaise: withdrawal.amountPaise,
      reason,
    });

    return withdrawal;
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    throw err;
  }
}

async function getMyWithdrawals(userId) {
  return Withdrawal.find({ userId }).sort({ createdAt: -1 });
}

module.exports = { requestWithdrawal, adminListPending, approve, reject, getMyWithdrawals };
