/**
 * auth.service.js
 * ---------------------------------------------------------------------------
 * RULE (SCHEMA_NOTES.md se): business logic hamesha service layer me,
 * controller sirf HTTP handle karega. Isliye ye poora file bina req/res ke
 * likha hai — sirf plain functions jo data lete hain aur data lautate hain.
 * Isse aage chal ke isi logic ko WhatsApp bot ya admin panel se bhi reuse
 * kar sakte hain, bina controller duplicate kiye.
 * ---------------------------------------------------------------------------
 */

const User = require('../models/user.model');
const Otp = require('../models/otp.model');
const AppError = require('../utils/AppError');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateOtp, hashOtp, getExpiryDate, MAX_ATTEMPTS } = require('../utils/otpHelper');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sendOtpSms, sendOtpEmail } = require('./sms.service');
const { USER_ROLE, USER_STATUS, KYC_STATUS, OTP_PURPOSE } = require('../constants/enums');

// Email ya phone — dono ek hi field me aate hain kai jagah, isliye ek
// chhota helper jo pehchaane ki type kya hai
function isEmail(identifier) {
  return identifier.includes('@');
}

/**
 * OTP generate karke bhejta hai. Signup, login, forgot-password — sabme
 * yahi function use hoga, sirf `purpose` badlega.
 */
async function issueOtp(identifier, purpose) {
  const otp = generateOtp();

  await Otp.create({
    identifier,
    otpHash: hashOtp(otp),
    purpose,
    expiresAt: getExpiryDate(),
  });

  if (isEmail(identifier)) {
    await sendOtpEmail(identifier, otp);
  } else {
    await sendOtpSms(identifier, otp);
  }
}

/**
 * OTP verify karta hai. Ye function sirf TRUE/FALSE nahi lautata —
 * throw karta hai proper message ke saath, taaki user ko pata chale
 * "expire ho gaya" vs "galat OTP" vs "bahut baar try kiya".
 */
async function verifyOtp(identifier, otp, purpose) {
  // Sabse naya, abhi tak use na hua OTP dhoondo
  const otpRecord = await Otp.findOne({
    identifier,
    purpose,
    isUsed: false,
  })
    .sort({ createdAt: -1 })
    .select('+otpHash');

  if (!otpRecord) {
    throw new AppError('OTP not found. Please request a new one.', 400);
  }

  if (otpRecord.attempts >= MAX_ATTEMPTS) {
    throw new AppError('Too many incorrect attempts. Please request a new OTP.', 429);
  }

  if (otpRecord.expiresAt < new Date()) {
    throw new AppError('OTP has expired. Please request a new one.', 400);
  }

  if (otpRecord.otpHash !== hashOtp(otp)) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    throw new AppError('Incorrect OTP.', 400);
  }

  otpRecord.isUsed = true;
  await otpRecord.save();

  return true;
}

/**
 * SIGNUP
 * -------------------------------------------------------------------------
 * User turant "active" nahi banta. Pehle account banta hai status=unverified,
 * phir OTP verify karne pe active hota hai. Isse fake email/phone se
 * junk accounts nahi bante.
 */
async function signup({ email, phone, password, fullName }) {
  const identifier = email || phone;

  const existing = await User.findOne(
    email ? { email } : { phone }
  );
  if (existing) {
    throw new AppError('This email/phone is already registered.', 409);
  }

  const passwordHash = await hashPassword(password);

  const user = await User.create({
    email,
    phone,
    passwordHash,
    fullName,
    status: USER_STATUS.UNVERIFIED,
  });

  await issueOtp(identifier, OTP_PURPOSE.SIGNUP);

  return { userId: user._id, identifier };
}

/**
 * SIGNUP OTP VERIFY — is step ke baad hi user login kar sakta hai
 */
async function verifySignupOtp(identifier, otp) {
  await verifyOtp(identifier, otp, OTP_PURPOSE.SIGNUP);

  const query = isEmail(identifier) ? { email: identifier } : { phone: identifier };
  const user = await User.findOne(query);

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  if (isEmail(identifier)) {
    user.isEmailVerified = true;
  } else {
    user.isPhoneVerified = true;
  }
  user.status = USER_STATUS.ACTIVE;
  await user.save();

  return issueTokenPair(user);
}

async function resendOtp(identifier, purpose) {
  // Rate-limit yahan bhi lagega (route level pe express-rate-limit se) —
  // par ek extra safety: pichhle 60 second me OTP bheja gaya to mat bhejo
  const recentOtp = await Otp.findOne({ identifier, purpose }).sort({ createdAt: -1 });

  if (recentOtp && Date.now() - recentOtp.createdAt.getTime() < 60 * 1000) {
    throw new AppError('Please wait a bit before trying again (60 seconds).', 429);
  }

  await issueOtp(identifier, purpose);
}

/**
 * LOGIN
 * -------------------------------------------------------------------------
 * NOTE: passwordHash field `select: false` hai user model me, isliye yahan
 * explicitly .select('+passwordHash') karna zaroori hai — warna hamesha
 * undefined milega aur compare fail hoga.
 */
async function login(identifier, password) {
  const query = isEmail(identifier) ? { email: identifier } : { phone: identifier };

  const user = await User.findOne(query).select('+passwordHash');

  if (!user) {
    // Jaan-boojh kar generic message — "email exist nahi karta" bolna
    // attacker ko bata deta hai ki kaunsa email registered hai (enumeration attack)
    throw new AppError('Incorrect email/phone or password.', 401);
  }

  if (user.status === USER_STATUS.SUSPENDED) {
    throw new AppError('Your account has been suspended. Please contact support.', 403);
  }

  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    throw new AppError('Incorrect email/phone or password.', 401);
  }

  if (user.status === USER_STATUS.UNVERIFIED) {
    // Login allow nahi, pehle OTP verify karna padega
    await issueOtp(identifier, OTP_PURPOSE.SIGNUP);
    throw new AppError('Account not verified. An OTP has been sent — please verify first.', 403);
  }

  user.lastLoginAt = new Date();
  await user.save();

  return issueTokenPair(user);
}

/**
 * Token pair banata hai — access + refresh dono.
 * Payload me sirf userId aur activeRole — kabhi bhi sensitive data nahi.
 */
function issueTokenPair(user) {
  const payload = { userId: user._id.toString(), activeRole: user.activeRole };

  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      roles: user.roles,
      activeRole: user.activeRole,
      kycStatus: user.kycStatus,
    },
  };
}

/**
 * REFRESH — expired access token ke liye naya banata hai, bina dobara
 * login kiye. Refresh token khud expire ho jaaye (7 din baad) to phir
 * se login karna padega.
 */
async function refreshAccessToken(refreshToken) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (err) {
    throw new AppError('Refresh token is invalid or expired. Please log in again.', 401);
  }

  const user = await User.findById(decoded.userId);
  if (!user || user.status === USER_STATUS.SUSPENDED) {
    throw new AppError('Account not found or suspended.', 401);
  }

  // Naya access token — activeRole database se fresh liya, token se nahi
  // (agar beech me role switch hua ho to purana token stale ho sakta hai)
  return {
    accessToken: signAccessToken({ userId: user._id.toString(), activeRole: user.activeRole }),
  };
}

/**
 * FORGOT PASSWORD — flow: OTP maango -> OTP verify + naya password ek saath
 */
async function forgotPassword(identifier) {
  const query = isEmail(identifier) ? { email: identifier } : { phone: identifier };
  const user = await User.findOne(query);

  // Security: user exist na kare tab bhi "success" bolo (varna attacker
  // pata laga sakta hai kaunsa email registered hai)
  if (!user) return;

  await issueOtp(identifier, OTP_PURPOSE.FORGOT_PASSWORD);
}

async function resetPassword(identifier, otp, newPassword) {
  await verifyOtp(identifier, otp, OTP_PURPOSE.FORGOT_PASSWORD);

  const query = isEmail(identifier) ? { email: identifier } : { phone: identifier };
  const user = await User.findOne(query);

  if (!user) {
    throw new AppError('User not found.', 404);
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
}

/**
 * PROFILE SETUP — signup ke baad ka doosra step (doc: naam, GST, PAN, address)
 */
async function setupProfile(userId, data) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found.', 404);

  if (data.fullName) user.fullName = data.fullName;
  if (data.companyName) user.companyName = data.companyName;
  if (data.gstNumber) user.gstNumber = data.gstNumber;
  if (data.panNumber) user.panNumber = data.panNumber;

  if (data.address) {
    // Pehla address default ban jaata hai apne aap
    const isFirst = user.addresses.length === 0;
    user.addresses.push({ ...data.address, isDefault: isFirst });
  }

  await user.save();
  return user;
}

/**
 * ROLE SWITCH — Buyer <-> Seller
 * -------------------------------------------------------------------------
 * Seller banne ke liye KYC verified hona ZAROORI hai (doc ka rule, aur
 * user.model.js ka `canSell` virtual isi pe based hai).
 *
 * NOTE: KYC "mandatory ya optional" wala confusion abhi tak client se
 * clear nahi hua (SCHEMA_NOTES.md dekhiye). Abhi mandatory maan ke chal
 * rahe hain kyunki description me yahi likha hai.
 */
async function switchRole(userId, targetRole) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found.', 404);

  if (targetRole === USER_ROLE.SELLER) {
    if (user.kycStatus !== KYC_STATUS.VERIFIED) {
      throw new AppError('You must verify your KYC before becoming a seller.', 403);
    }
    if (!user.roles.includes(USER_ROLE.SELLER)) {
      user.roles.push(USER_ROLE.SELLER);
    }
  }

  user.activeRole = targetRole;
  await user.save();

  return user;
}

module.exports = {
  signup,
  verifySignupOtp,
  resendOtp,
  login,
  refreshAccessToken,
  forgotPassword,
  resetPassword,
  setupProfile,
  switchRole,
};
