// Ye middleware har "protected" route pe lagega — jaise profile update,
// bid lagana, listing banana. Header me "Authorization: Bearer <token>"
// hona chahiye.

const { verifyAccessToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');
const User = require('../models/user.model');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('You must be logged in.', 401));
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    // TokenExpiredError vs invalid — dono ko same treat karte hain user ke liye,
    // frontend refresh-token endpoint try karega
    return next(new AppError('Session expired. Please log in again.', 401));
  }

  // Har request pe DB check isliye zaroori hai — token valid ho sakta hai
  // par beech me admin ne account suspend kar diya ho
  const user = await User.findById(decoded.userId);
  if (!user) {
    return next(new AppError('User not found.', 401));
  }
  if (user.status === 'suspended') {
    return next(new AppError('Your account is suspended.', 403));
  }

  // req.user hamesha lightweight rahega — poora user document nahi,
  // sirf jo aage middlewares/controllers ko chahiye
  req.user = { userId: user._id.toString(), activeRole: user.activeRole, roles: user.roles };
  next();
}

/**
 * requireRole('seller') — kisi specific role ke liye route lock karna.
 * Ye check karta hai activeRole se, kyunki security-sensitive decision
 * hamesha activeRole se lena hai (user.model.js me isi tarah design kiya).
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.activeRole)) {
      return next(new AppError(`Only ${allowedRoles.join('/')} can perform this action.`, 403));
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
