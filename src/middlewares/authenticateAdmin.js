/**
 * authenticateAdmin.js
 * ---------------------------------------------------------------------------
 * User authenticate.js se BILKUL ALAG hai — jaan-boojh kar.
 *
 * Admin ke paas paisa release karne ki power hai, isliye alag JWT secret
 * (.env: JWT_ADMIN_SECRET), aur account-lock check bhi yahan hota hai.
 *
 * NOTE: Admin LOGIN endpoint khud Phase 5 (Admin Panel Core) me banega.
 * Ye middleware sirf token VERIFY karta hai — token issue karne ka route
 * abhi nahi hai. Testing ke liye `scripts/seedSuperAdmin.js` se ek Super
 * Admin bana ke uska token manually generate kar sakte hain (README dekhiye).
 * ---------------------------------------------------------------------------
 */

const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const AdminUser = require('../models/admin.model');

async function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Admin login is required.', 401));
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET);
  } catch (err) {
    return next(new AppError('Session expired. Please log in again.', 401));
  }

  const admin = await AdminUser.findById(decoded.adminId).select('+twoFactorSecret');
  if (!admin || admin.isDeleted || !admin.isActive) {
    return next(new AppError('Admin account not found or inactive.', 401));
  }

  // Password change hone ke baad purane tokens invalid ho jaayenge
  if (admin.passwordChangedAt && decoded.iat * 1000 < admin.passwordChangedAt.getTime()) {
    return next(new AppError('Your password has been changed. Please log in again.', 401));
  }

  req.admin = {
    adminId: admin._id.toString(),
    fullName: admin.fullName,
    email: admin.email,
    role: admin.role,
    // `permissions` array yahan zaroori hai kyunki `getMe` controller
    // (GET /admin/me) seedha `req.admin` ko JSON response bana deta hai —
    // `hasPermission` function JSON.stringify me drop ho jaata hai, isliye
    // frontend ko permissions check karne ke liye ye plain array chahiye.
    // (Bug pakड़ा gaya jab frontend admin panel banate waqt — page refresh
    // ke baad sub-admin ke liye nav items ghayab ho rahe the, kyunki
    // /admin/me response me permissions field hi nahi tha.)
    permissions: admin.permissions,
    hasPermission: (perm) => admin.hasPermission(perm),
  };
  next();
}

/**
 * requirePermission('kyc:verify') — route-level permission gate.
 * Super Admin ke liye `hasPermission()` hamesha true lautata hai
 * (model me hi define hai), isliye alag se check nahi karna padta.
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.admin.hasPermission(permission)) {
      return next(new AppError('You do not have permission for this action.', 403));
    }
    next();
  };
}

/**
 * Kuch actions (jaise sub-admin banana, permissions dena) sirf Super Admin
 * kar sakta hai — chahe kisi sub-admin ke paas `subadmin:manage` permission
 * ho bhi, phir bhi nahi. Kyunki agar sub-admin khud sub-admin bana sake,
 * to wo apne aap ko sab permissions de sakta hai — privilege escalation.
 */
function requireSuperAdmin(req, res, next) {
  if (req.admin.role !== 'super_admin') {
    return next(new AppError('Only a Super Admin can perform this action.', 403));
  }
  next();
}

module.exports = { authenticateAdmin, requirePermission, requireSuperAdmin };
