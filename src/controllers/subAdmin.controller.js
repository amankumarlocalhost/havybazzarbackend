const subAdminService = require('../services/subAdmin.service');
const catchAsync = require('../utils/catchAsync');

exports.create = catchAsync(async (req, res) => {
  const subAdmin = await subAdminService.createSubAdmin(req.body, req.admin);
  res.status(201).json({ success: true, message: 'Sub-admin created successfully', data: subAdmin });
});

exports.list = catchAsync(async (req, res) => {
  const subAdmins = await subAdminService.listSubAdmins();
  res.status(200).json({ success: true, data: subAdmins });
});

exports.updatePermissions = catchAsync(async (req, res) => {
  const subAdmin = await subAdminService.updatePermissions(
    req.params.subAdminId,
    req.body.permissions,
    req.admin
  );
  res.status(200).json({ success: true, message: 'Permissions updated successfully', data: subAdmin });
});

exports.setActiveStatus = catchAsync(async (req, res) => {
  const subAdmin = await subAdminService.setActiveStatus(req.params.subAdminId, req.body.isActive, req.admin);
  res.status(200).json({
    success: true,
    message: req.body.isActive ? 'Sub-admin activated' : 'Sub-admin deactivated',
    data: subAdmin,
  });
});
