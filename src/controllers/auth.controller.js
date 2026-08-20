// Is file me koi business logic NAHI hai — sirf auth.service ko call karna
// aur response bhejna. Rule SCHEMA_NOTES.md me likha hua hai.

const authService = require('../services/auth.service');
const catchAsync = require('../utils/catchAsync');

/**
 * Frontend (Vercel) aur backend (Render) alag-alag domains pe hain, isliye
 * ye cookie CROSS-SITE request me bhejni padti hai. `sameSite: 'strict'`
 * (ya 'lax') browsers me cross-site cookie kabhi bhejte hi nahi — isliye
 * refresh-token hamesha 401 deta tha, chahe login bilkul sahi se hua ho.
 *
 * Fix: production me `sameSite: 'none'` + `secure: true` (dono zaroori
 * hain — browsers SameSite=None ko bina Secure ke reject kar dete hain).
 * Local dev me localhost HTTPS nahi hota, isliye wahan `secure: true` cookie
 * set hi nahi hoti — dev me 'lax' + secure:false use karte hain (localhost
 * frontend/backend alag ports pe hone ke bawajood "same-site" maane jaate
 * hain, port SameSite policy me matter nahi karta).
 */
function getRefreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 din
  };
}

exports.signup = catchAsync(async (req, res) => {
  const result = await authService.signup(req.body);
  res.status(201).json({
    success: true,
    message: 'OTP sent, please verify',
    data: result,
  });
});

exports.verifySignupOtp = catchAsync(async (req, res) => {
  const { identifier, otp } = req.body;
  const result = await authService.verifySignupOtp(identifier, otp);

  // Refresh token httpOnly cookie me — localStorage me nahi (XSS se safe)
  res.cookie('refreshToken', result.refreshToken, getRefreshCookieOptions());

  res.status(200).json({
    success: true,
    message: 'Account verified successfully',
    data: { accessToken: result.accessToken, user: result.user },
  });
});

exports.resendOtp = catchAsync(async (req, res) => {
  const { identifier, purpose } = req.body;
  await authService.resendOtp(identifier, purpose);
  res.status(200).json({ success: true, message: 'OTP resent' });
});

exports.login = catchAsync(async (req, res) => {
  const { identifier, password } = req.body;
  const result = await authService.login(identifier, password);

  res.cookie('refreshToken', result.refreshToken, getRefreshCookieOptions());

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: { accessToken: result.accessToken, user: result.user },
  });
});

exports.refreshToken = catchAsync(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Refresh token not found, please log in again' });
  }

  const result = await authService.refreshAccessToken(token);
  res.status(200).json({ success: true, data: result });
});

exports.logout = catchAsync(async (req, res) => {
  res.clearCookie('refreshToken');
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

exports.forgotPassword = catchAsync(async (req, res) => {
  await authService.forgotPassword(req.body.identifier);
  // Hamesha same message — chahe user exist kare ya na kare (security)
  res.status(200).json({
    success: true,
    message: 'If this account exists, an OTP has been sent',
  });
});

exports.resetPassword = catchAsync(async (req, res) => {
  const { identifier, otp, newPassword } = req.body;
  await authService.resetPassword(identifier, otp, newPassword);
  res.status(200).json({ success: true, message: 'Password changed successfully, please log in' });
});

exports.setupProfile = catchAsync(async (req, res) => {
  const user = await authService.setupProfile(req.user.userId, req.body);
  res.status(200).json({ success: true, message: 'Profile updated successfully', data: user });
});

exports.switchRole = catchAsync(async (req, res) => {
  const { role } = req.body;
  const user = await authService.switchRole(req.user.userId, role);
  res.status(200).json({
    success: true,
    message: `You are now in ${role} mode`,
    data: { roles: user.roles, activeRole: user.activeRole },
  });
});

exports.getMe = catchAsync(async (req, res) => {
  // req.user middleware se aaya (authenticate.js) — bas fresh data chahiye
  const User = require('../models/user.model');
  const user = await User.findById(req.user.userId);
  res.status(200).json({ success: true, data: user });
});
