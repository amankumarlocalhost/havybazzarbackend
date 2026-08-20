const walletService = require('../services/wallet.service');
const catchAsync = require('../utils/catchAsync');

exports.getBalance = catchAsync(async (req, res) => {
  const balancePaise = await walletService.getBalance(req.user.userId);
  res.status(200).json({ success: true, data: { balancePaise } });
});

exports.getHistory = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await walletService.getHistory(req.user.userId, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  res.status(200).json({ success: true, data: result });
});
