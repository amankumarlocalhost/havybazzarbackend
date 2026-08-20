/**
 * subAdmin.service.js
 * ---------------------------------------------------------------------------
 * Sirf Super Admin call kar sakta hai (route-level `requireSuperAdmin`
 * middleware isko enforce karta hai).
 * ---------------------------------------------------------------------------
 */

const AdminUser = require('../models/admin.model');
const AppError = require('../utils/AppError');
const { hashPassword } = require('../utils/password');
const { logAdminAction } = require('./auditLog.service');
const { ADMIN_ROLE, AUDIT_ACTION } = require('../constants/enums');

async function createSubAdmin({ email, password, fullName, phone, permissions }, superAdminInfo) {
  const existing = await AdminUser.findOne({ email });
  if (existing) {
    throw new AppError('This email is already registered to an admin account.', 409);
  }

  const passwordHash = await hashPassword(password);

  const subAdmin = await AdminUser.create({
    email,
    passwordHash,
    fullName,
    phone,
    role: ADMIN_ROLE.SUB_ADMIN,
    permissions: permissions || [],
    createdByAdminId: superAdminInfo.adminId,
  });

  await logAdminAction({
    adminId: superAdminInfo.adminId,
    adminName: superAdminInfo.fullName,
    adminEmail: superAdminInfo.email,
    action: AUDIT_ACTION.SUBADMIN_CREATED,
    targetType: 'AdminUser',
    targetId: subAdmin._id,
    targetLabel: subAdmin.fullName,
    changesAfter: { permissions: subAdmin.permissions },
  });

  return subAdmin;
}

async function listSubAdmins() {
  return AdminUser.find({ role: ADMIN_ROLE.SUB_ADMIN, isDeleted: false }).sort({ createdAt: -1 });
}

async function updatePermissions(subAdminId, permissions, superAdminInfo) {
  const subAdmin = await AdminUser.findOne({ _id: subAdminId, role: ADMIN_ROLE.SUB_ADMIN, isDeleted: false });
  if (!subAdmin) throw new AppError('Sub-admin not found.', 404);

  const before = { permissions: subAdmin.permissions };
  subAdmin.permissions = permissions;
  await subAdmin.save();

  await logAdminAction({
    adminId: superAdminInfo.adminId,
    adminName: superAdminInfo.fullName,
    adminEmail: superAdminInfo.email,
    action: AUDIT_ACTION.SUBADMIN_UPDATED,
    targetType: 'AdminUser',
    targetId: subAdmin._id,
    targetLabel: subAdmin.fullName,
    changesBefore: before,
    changesAfter: { permissions },
  });

  return subAdmin;
}

async function setActiveStatus(subAdminId, isActive, superAdminInfo) {
  const subAdmin = await AdminUser.findOne({ _id: subAdminId, role: ADMIN_ROLE.SUB_ADMIN, isDeleted: false });
  if (!subAdmin) throw new AppError('Sub-admin not found.', 404);

  subAdmin.isActive = isActive;
  await subAdmin.save();

  await logAdminAction({
    adminId: superAdminInfo.adminId,
    adminName: superAdminInfo.fullName,
    adminEmail: superAdminInfo.email,
    action: AUDIT_ACTION.SUBADMIN_UPDATED,
    targetType: 'AdminUser',
    targetId: subAdmin._id,
    targetLabel: subAdmin.fullName,
    changesAfter: { isActive },
    reason: isActive ? 'Reactivated' : 'Deactivated',
  });

  return subAdmin;
}

module.exports = { createSubAdmin, listSubAdmins, updatePermissions, setActiveStatus };
