const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { otpLimiter, loginLimiter } = require('../middlewares/rateLimiter');

const {
  signupSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  profileSetupSchema,
} = require('../validators/auth.validator');

// ---- Public routes ----
router.post('/signup', validate(signupSchema), authController.signup);
router.post('/verify-signup-otp', otpLimiter, validate(verifyOtpSchema), authController.verifySignupOtp);
router.post('/resend-otp', otpLimiter, validate(resendOtpSchema), authController.resendOtp);

router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);

router.post('/forgot-password', otpLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', otpLimiter, validate(resetPasswordSchema), authController.resetPassword);

// ---- Protected routes (login zaroori) ----
router.get('/me', authenticate, authController.getMe);
router.patch('/profile', authenticate, validate(profileSetupSchema), authController.setupProfile);
router.post('/switch-role', authenticate, authController.switchRole);

module.exports = router;
