const dashboardService = require('../services/dashboard.service');
const catchAsync = require('../utils/catchAsync');

exports.getStats = catchAsync(async (req, res) => {
  const stats = await dashboardService.getStats();
  res.status(200).json({ success: true, data: stats });
});

exports.getRevenueTrend = catchAsync(async (req, res) => {
  const weeks = parseInt(req.query.weeks) || 5;
  const trend = await dashboardService.getRevenueTrend(weeks);
  res.status(200).json({ success: true, data: trend });
});

exports.getRecentActivity = catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const activity = await dashboardService.getRecentActivity(limit);
  res.status(200).json({ success: true, data: activity });
});
