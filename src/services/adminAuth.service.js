/**
 * adminAuth.service.js
 * ---------------------------------------------------------------------------
 * Admin LOGIN yahan hai. SIGNUP jaan-boojh kar nahi hai — pehla Super Admin
 * `scripts/seedSuperAdmin.js` se banta hai, uske baad sirf Super Admin
 * panel se sub-admins bana sakta hai (subAdmin.service.js). Public admin
 * signup ka matlab hoga koi bhi admin ban sakta hai — bilkul allowed nahi.
 *
 * Brute-force lockout: 5 galat password ke baad account 30 minute lock.
 * User login (auth.service.js) me ye nahi hai kyunki wahan rate-limiter
 * middleware kaafi hai — par admin ke paas paisa release karne ki power
 * hai, isliye ek extra layer.
 * ---------------------------------------------------------------------------
 */

const jwt = require('jsonwebtoken');
const AdminUser = require('../models/admin.model');
const AppError = require('../utils/AppError');
const { comparePassword } = require('../utils/password');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

function signAdminToken(adminId) {
  return jwt.sign({ adminId }, process.env.JWT_ADMIN_SECRET, {
    expiresIn: process.env.JWT_ADMIN_EXPIRY || '8h',
  });
}

async function login(email, password, ipAddress) {
  const admin = await AdminUser.findOne({ email }).select('+passwordHash');

  if (!admin || admin.isDeleted) {
    // Generic message — enumeration attack na ho
    throw new AppError('Incorrect email or password.', 401);
  }

  if (!admin.isActive) {
    throw new AppError('This admin account is inactive.', 403);
  }

  if (admin.isLocked()) {
    const minutesLeft = Math.ceil((admin.lockedUntil - new Date()) / 60000);
    throw new AppError(`Account is locked. Try again in ${minutesLeft} minute(s).`, 423);
  }

  const isMatch = await comparePassword(password, admin.passwordHash);

  if (!isMatch) {
    admin.failedLoginAttempts += 1;

    if (admin.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      admin.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    }

    await admin.save();
    throw new AppError('Incorrect email or password.', 401);
  }

  // Login successful — sab counters reset
  admin.failedLoginAttempts = 0;
  admin.lockedUntil = undefined;
  admin.lastLoginAt = new Date();
  admin.lastLoginIp = ipAddress;
  await admin.save();

  const token = signAdminToken(admin._id.toString());

  return {
    accessToken: token,
    admin: {
      id: admin._id,
      fullName: admin.fullName,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions,
    },
  };
}

module.exports = { login, signAdminToken };
