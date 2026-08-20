/**
 * seedSuperAdmin.js
 * ---------------------------------------------------------------------------
 * Admin panel me PUBLIC SIGNUP nahi hota — koi bhi random banda admin nahi
 * ban sakta. Isliye PEHLA Super Admin is script se manually banaya jaata
 * hai, seedha database me. Uske baad wahi Super Admin panel se aur
 * sub-admins bana sakta hai.
 *
 * Chalane ka tareeka:
 *   node scripts/seedSuperAdmin.js
 *
 * (Poochega email/password terminal me, ya .env se ADMIN_SEED_EMAIL /
 * ADMIN_SEED_PASSWORD utha lega agar set hon.)
 * ---------------------------------------------------------------------------
 */

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
const AdminUser = require('../src/models/admin.model');
const { hashPassword } = require('../src/utils/password');
const { ADMIN_ROLE } = require('../src/constants/enums');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected.\n');

  const existingSuperAdmin = await AdminUser.findOne({ role: ADMIN_ROLE.SUPER_ADMIN });
  if (existingSuperAdmin) {
    console.log(`Ek Super Admin pehle se hai: ${existingSuperAdmin.email}`);
    console.log('Naya banana hai to pehle isko database se hataiye, ya sub-admin panel use karein.');
    process.exit(0);
  }

  const email = process.env.ADMIN_SEED_EMAIL || (await ask('Super Admin email: '));
  const password = process.env.ADMIN_SEED_PASSWORD || (await ask('Super Admin password (min 8 char): '));
  const fullName = (await ask('Full name: ')) || 'Super Admin';

  if (!email || !password || password.length < 8) {
    console.error('Email zaroori hai aur password kam se kam 8 character ka.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const admin = await AdminUser.create({
    email: email.toLowerCase(),
    passwordHash,
    fullName,
    role: ADMIN_ROLE.SUPER_ADMIN,
  });

  console.log(`\n✅ Super Admin ban gaya: ${admin.email} (id: ${admin._id})`);
  console.log('Ab isi email/password se admin login endpoint use kar sakte hain (Phase 5 me banega).');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed script fail hua:', err.message);
  process.exit(1);
});
