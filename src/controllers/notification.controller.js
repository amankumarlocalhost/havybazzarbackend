const notificationService = require('../services/notification.service');
const catchAsync = require('../utils/catchAsync');

exports.getMine = catchAsync(async (req, res) => {
  const { page, limit, unreadOnly } = req.query;
  const result = await notificationService.getMyNotifications(req.user.userId, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    unreadOnly: unreadOnly === 'true',
  });
  res.status(200).json({ success: true, data: result });
});

exports.markAsRead = catchAsync(async (req, res) => {
  await notificationService.markAsRead(req.params.notificationId, req.user.userId);
  res.status(200).json({ success: true, message: 'Marked as read' });
});

exports.markAllAsRead = catchAsync(async (req, res) => {
  await notificationService.markAllAsRead(req.user.userId);
  res.status(200).json({ success: true, message: 'All marked as read' });
});
