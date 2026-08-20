const userManagementService = require('../services/userManagement.service');
const catchAsync = require('../utils/catchAsync');

exports.list = catchAsync(async (req, res) => {
  const { role, status, kycStatus, search, page, limit } = req.query;
  const result = await userManagementService.listUsers({
    role,
    status,
    kycStatus,
    search,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  res.status(200).json({ success: true, data: result });
});

exports.getOne = catchAsync(async (req, res) => {
  const result = await userManagementService.getUserDetail(req.params.userId);
  res.status(200).json({ success: true, data: result });
});

exports.suspend = catchAsync(async (req, res) => {
  await userManagementService.suspendUser(req.params.userId, req.admin, req.body.reason);
  res.status(200).json({ success: true, message: 'User suspended successfully' });
});

exports.activate = catchAsync(async (req, res) => {
  await userManagementService.activateUser(req.params.userId, req.admin);
  res.status(200).json({ success: true, message: 'User activated successfully' });
});

exports.makeSeller = catchAsync(async (req, res) => {
  await userManagementService.makeSeller(req.params.userId, req.admin);
  res.status(200).json({ success: true, message: 'User is now a seller' });
});

exports.exportCsv = catchAsync(async (req, res) => {
  const { role, status } = req.query;
  const csv = await userManagementService.exportUsersCsv({ role, status });

  res.header('Content-Type', 'text/csv');
  res.attachment('heavy-bazar-users.csv');
  res.send(csv);
});
