const reportService = require('../services/report.service');
const catchAsync = require('../utils/catchAsync');

exports.adminSales = catchAsync(async (req, res) => {
  const { from, to } = req.query;
  const result = await reportService.getAdminSalesReport({ from, to });
  res.status(200).json({ success: true, data: result });
});

exports.adminAuctions = catchAsync(async (req, res) => {
  const { from, to } = req.query;
  const result = await reportService.getAdminAuctionSummary({ from, to });
  res.status(200).json({ success: true, data: result });
});

exports.sellerSales = catchAsync(async (req, res) => {
  const { from, to } = req.query;
  const result = await reportService.getSellerSalesReport(req.user.userId, { from, to });
  res.status(200).json({ success: true, data: result });
});

exports.sellerAuctions = catchAsync(async (req, res) => {
  const result = await reportService.getSellerAuctionSummary(req.user.userId);
  res.status(200).json({ success: true, data: result });
});
