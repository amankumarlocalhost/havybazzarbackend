// Ye middleware har "protected" route pe lagega — jaise profile update,
// bid lagana, listing banana. Header me "Authorization: Bearer <token>"
// hona chahiye.
//
// BYPASS MODE: client se login hataane ke liye — agar valid Bearer token
// nahi mila, to ek shared guest user auto-provision ho jaata hai aur
// request usi identity se aage badhti hai. Isse har route (jo pehle
// authenticate maangta tha) bina login ke chalega, aur downstream code
// (req.user.userId/roles wagairah) crash nahi karega.

const { verifyAccessToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');
const User = require('../models/user.model');
const { USER_ROLE, USER_STATUS, KYC_STATUS } = require('../constants/enums');

const GUEST_EMAIL = 'guest@heavybazar.local';
let guestUserPromise = null;

async function getOrCreateGuestUser() {
  if (!guestUserPromise) {
    guestUserPromise = (async () => {
      let guest = await User.findOne({ email: GUEST_EMAIL });
      if (!guest) {
        guest = await User.create({
          email: GUEST_EMAIL,
          passwordHash: 'no-login-guest-account',
          fullName: 'Guest User',
          roles: [USER_ROLE.BUYER, USER_ROLE.SELLER],
          activeRole: USER_ROLE.BUYER,
          status: USER_STATUS.ACTIVE,
          isEmailVerified: true,
          kycStatus: KYC_STATUS.VERIFIED,
        });
      }
      return guest;
    })();
  }
  return guestUserPromise;
}

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const guest = await getOrCreateGuestUser();
    req.user = { userId: guest._id.toString(), activeRole: guest.activeRole, roles: guest.roles };
    return next();
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    const guest = await getOrCreateGuestUser();
    req.user = { userId: guest._id.toString(), activeRole: guest.activeRole, roles: guest.roles };
    return next();
  }

  // Har request pe DB check isliye zaroori hai — token valid ho sakta hai
  // par beech me admin ne account suspend kar diya ho
  const user = await User.findById(decoded.userId);
  if (!user || user.status === 'suspended') {
    const guest = await getOrCreateGuestUser();
    req.user = { userId: guest._id.toString(), activeRole: guest.activeRole, roles: guest.roles };
    return next();
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
