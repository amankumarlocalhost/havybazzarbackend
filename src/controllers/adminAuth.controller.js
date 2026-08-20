const adminAuthService = require('../services/adminAuth.service');
const catchAsync = require('../utils/catchAsync');

exports.login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const ipAddress = req.ip;

  const result = await adminAuthService.login(email, password, ipAddress);

  res.status(200).json({ success: true, message: 'Login successful', data: result });
});

exports.getMe = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, data: req.admin });
});
