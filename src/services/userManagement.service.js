/**
 * userManagement.service.js
 * ---------------------------------------------------------------------------
 * Doc ka module: "Manage Buyers/Sellers" — edit/remove, view profile +
 * order history, KYC status dekhna, enable/disable account, CSV export.
 * ---------------------------------------------------------------------------
 */

const User = require('../models/user.model');
const Order = require('../models/order.model');
const Listing = require('../models/listing.model');
const KycVerification = require('../models/kyc.model');
const AppError = require('../utils/AppError');
const { logAdminAction } = require('./auditLog.service');
const { AUDIT_ACTION, USER_STATUS, USER_ROLE, KYC_STATUS } = require('../constants/enums');

async function listUsers({ role, status, kycStatus, search, page = 1, limit = 20 }) {
  const query = { isDeleted: false };

  if (role) query.roles = role;
  if (status) query.status = status;
  if (kycStatus) query.kycStatus = kycStatus;
  if (search) {
    query.$or = [
      { fullName: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(query),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function getUserDetail(userId) {
  const user = await User.findById(userId).select('+panNumber');
  if (!user) throw new AppError('User not found.', 404);

  const [ordersAsBuyer, ordersAsSeller, listings, latestKyc] = await Promise.all([
    Order.find({ buyerId: userId }).sort({ createdAt: -1 }).limit(20).populate('listingId', 'title'),
    Order.find({ sellerId: userId }).sort({ createdAt: -1 }).limit(20).populate('listingId', 'title'),
    Listing.find({ sellerId: userId, isDeleted: false }).sort({ createdAt: -1 }).limit(20),
    KycVerification.findOne({ userId }).sort({ createdAt: -1 }),
  ]);

  // PAN sensitive hai — admin ko poora dikhana theek hai (dispute resolution
  // ke liye), par CSV export me kabhi nahi (dekhiye exportUsersCsv())
  const profile = user.toObject();

  return {
    profile,
    ordersAsBuyer,
    ordersAsSeller,
    listings,
    kyc: latestKyc,
  };
}

async function suspendUser(userId, adminInfo, reason) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found.', 404);

  if (user.status === USER_STATUS.SUSPENDED) {
    throw new AppError('This user is already suspended.', 400);
  }

  user.status = USER_STATUS.SUSPENDED;
  await user.save();

  await logAdminAction({
    adminId: adminInfo.adminId,
    adminName: adminInfo.fullName,
    adminEmail: adminInfo.email,
    action: AUDIT_ACTION.USER_SUSPENDED,
    targetType: 'User',
    targetId: user._id,
    targetLabel: user.fullName,
    reason,
  });

  return user;
}

async function activateUser(userId, adminInfo) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found.', 404);

  user.status = USER_STATUS.ACTIVE;
  await user.save();

  await logAdminAction({
    adminId: adminInfo.adminId,
    adminName: adminInfo.fullName,
    adminEmail: adminInfo.email,
    action: AUDIT_ACTION.USER_ACTIVATED,
    targetType: 'User',
    targetId: user._id,
    targetLabel: user.fullName,
  });

  return user;
}

/**
 * ADMIN — user ko seller role deta hai directly.
 *
 * KYC verified hona zaroori hai — warna `canSell` virtual (user.model.js)
 * kabhi true nahi banega aur seller role hone ke bawajood user list/bid
 * nahi kar payega. Isliye ye check yahin, entry point pe, karte hain.
 */
async function makeSeller(userId, adminInfo) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found.', 404);

  if (user.roles.includes(USER_ROLE.SELLER)) {
    throw new AppError('This user is already a seller.', 400);
  }

  if (user.kycStatus !== KYC_STATUS.VERIFIED) {
    throw new AppError('User must have verified KYC before being made a seller.', 400);
  }

  user.roles.push(USER_ROLE.SELLER);
  await user.save();

  await logAdminAction({
    adminId: adminInfo.adminId,
    adminName: adminInfo.fullName,
    adminEmail: adminInfo.email,
    action: AUDIT_ACTION.USER_ROLE_UPDATED,
    targetType: 'User',
    targetId: user._id,
    targetLabel: user.fullName,
    changesBefore: { roles: user.roles.filter((r) => r !== USER_ROLE.SELLER) },
    changesAfter: { roles: user.roles },
  });

  return user;
}

/**
 * CSV export. Simple string-building — koi extra library nahi chahiye
 * itne columns ke liye.
 *
 * NOTE: PAN number CSV me kabhi export NAHI hota — sensitive data hai.
 */
async function exportUsersCsv({ role, status }) {
  const query = { isDeleted: false };
  if (role) query.roles = role;
  if (status) query.status = status;

  const users = await User.find(query).sort({ createdAt: -1 });

  const header = 'Name,Email,Phone,Roles,Status,KYC Status,Company,Created At';
  const rows = users.map((u) =>
    [
      csvEscape(u.fullName),
      csvEscape(u.email || ''),
      csvEscape(u.phone || ''),
      csvEscape(u.roles.join('|')),
      u.status,
      u.kycStatus,
      csvEscape(u.companyName || ''),
      u.createdAt.toISOString(),
    ].join(',')
  );

  return [header, ...rows].join('\n');
}

// Comma ya quotes wale values ko CSV-safe banata hai
function csvEscape(value) {
  if (value.includes(',') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

module.exports = { listUsers, getUserDetail, suspendUser, activateUser, makeSeller, exportUsersCsv };
