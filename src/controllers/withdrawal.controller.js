const withdrawalService = require('../services/withdrawal.service');
const catchAsync = require('../utils/catchAsync');

const RUPEES_TO_PAISE = 100;

exports.request = catchAsync(async (req, res) => {
  const amountPaise = Math.round(req.body.amount * RUPEES_TO_PAISE);
  const withdrawal = await withdrawalService.requestWithdrawal(req.user.userId, amountPaise, {
    bankAccountNumber: req.body.bankAccountNumber,
    bankIfsc: req.body.bankIfsc,
  });
  res.status(201).json({ success: true, message: 'Withdrawal request submitted', data: withdrawal });
});

exports.myWithdrawals = catchAsync(async (req, res) => {
  const withdrawals = await withdrawalService.getMyWithdrawals(req.user.userId);
  res.status(200).json({ success: true, data: withdrawals });
});

exports.adminListPending = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await withdrawalService.adminListPending({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  res.status(200).json({ success: true, data: result });
});

exports.approve = catchAsync(async (req, res) => {
  const withdrawal = await withdrawalService.approve(req.params.withdrawalId, req.admin);
  res.status(200).json({ success: true, message: 'Withdrawal approved', data: withdrawal });
});

exports.reject = catchAsync(async (req, res) => {
  const withdrawal = await withdrawalService.reject(req.params.withdrawalId, req.admin, req.body.reason);
  res.status(200).json({ success: true, message: 'Withdrawal rejected, coins refunded', data: withdrawal });
});
