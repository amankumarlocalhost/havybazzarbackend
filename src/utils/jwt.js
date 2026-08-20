/**
 * jwt.js
 * ---------------------------------------------------------------------------
 * Do tarah ke token banate hain:
 *
 *   ACCESS TOKEN  — short-lived (15 min). Har API request ke saath jaata hai.
 *                   Chori ho bhi jaaye to jaldi expire ho jaayega.
 *
 *   REFRESH TOKEN — long-lived (7 din). Sirf naya access token maangne ke
 *                   liye use hota hai. Isko safe jagah rakhna hota hai
 *                   (httpOnly cookie — localStorage nahi, XSS se churaya
 *                   ja sakta hai).
 *
 * Dono ke ALAG-ALAG secrets hain (.env me). Agar access token ka secret
 * leak ho jaaye, to refresh token abhi bhi safe rahega.
 * ---------------------------------------------------------------------------
 */

const jwt = require('jsonwebtoken');

function signAccessToken(payload) {
  // payload me sirf zaroori cheezein — userId, activeRole.
  // Kabhi bhi password ya sensitive data token ke andar mat daaliye,
  // JWT sirf encoded hota hai, ENCRYPTED nahi — koi bhi decode kar sakta hai.
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
  });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
