// Password hashing — bcrypt jaan-boojh kar SLOW hai. Ye achhi baat hai:
// attacker agar database chura le, to har password guess karne me
// (fast hash ke muqaable) bahut zyada time lagega.

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12; // jitna zyada, utna slow (aur secure). 12 industry-standard hai.

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function comparePassword(plainPassword, hash) {
  return bcrypt.compare(plainPassword, hash);
}

module.exports = { hashPassword, comparePassword };
