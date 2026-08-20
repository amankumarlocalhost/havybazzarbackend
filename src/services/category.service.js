/**
 * category.service.js
 * ---------------------------------------------------------------------------
 * Doc ka rule: sirf 2 level (parent -> child). Sirf admin bana sakta hai.
 * ---------------------------------------------------------------------------
 */

const Category = require('../models/category.model');
const Listing = require('../models/listing.model');
const AppError = require('../utils/AppError');
const { generateUniqueSlug } = require('../utils/slugify');
const { logAdminAction } = require('./auditLog.service');
const { AUDIT_ACTION } = require('../constants/enums');

async function createCategory(data, adminInfo) {
  if (data.parentId) {
    const parent = await Category.findById(data.parentId);
    if (!parent) throw new AppError('Parent category not found.', 404);

    // Rule: sirf 2 level. Agar parent ka apna parent hai, to ye 3rd level
    // ban jaayega — allowed nahi.
    if (parent.parentId) {
      throw new AppError('Only 2 levels of categories are allowed (parent -> child).', 400);
    }
  }

  const slug = await generateUniqueSlug(Category, data.name.en);

  const category = await Category.create({ ...data, slug });

  await logAdminAction({
    adminId: adminInfo.adminId,
    adminName: adminInfo.fullName,
    adminEmail: adminInfo.email,
    action: AUDIT_ACTION.CATEGORY_CREATED,
    targetType: 'Category',
    targetId: category._id,
    targetLabel: data.name.en,
    changesAfter: { name: data.name, parentId: data.parentId || null },
  });

  return category;
}

async function updateCategory(categoryId, data, adminInfo) {
  const category = await Category.findById(categoryId);
  if (!category) throw new AppError('Category not found.', 404);

  const before = { name: category.name, isActive: category.isActive };

  Object.assign(category, data);
  await category.save();

  await logAdminAction({
    adminId: adminInfo.adminId,
    adminName: adminInfo.fullName,
    adminEmail: adminInfo.email,
    action: AUDIT_ACTION.CATEGORY_UPDATED,
    targetType: 'Category',
    targetId: category._id,
    targetLabel: category.name.en,
    changesBefore: before,
    changesAfter: data,
  });

  return category;
}

/**
 * Soft delete — hard delete nahi karte kyunki purani listings isse judi
 * ho sakti hain (SCHEMA_NOTES.md ka global rule).
 */
async function deleteCategory(categoryId, adminInfo) {
  const category = await Category.findById(categoryId);
  if (!category) throw new AppError('Category not found.', 404);

  const activeListingsCount = await Listing.countDocuments({
    categoryId,
    isDeleted: false,
    status: { $ne: 'removed' },
  });

  if (activeListingsCount > 0) {
    // Delete nahi, sirf inactive kar do — taaki purani listings na tootein,
    // par nayi listing is category me na ban sake
    category.isActive = false;
    await category.save();

    await logAdminAction({
      adminId: adminInfo.adminId,
      adminName: adminInfo.fullName,
      adminEmail: adminInfo.email,
      action: AUDIT_ACTION.CATEGORY_DELETED,
      targetType: 'Category',
      targetId: category._id,
      targetLabel: category.name.en,
      reason: `${activeListingsCount} listing(s) are linked to this category, so it was only deactivated (not deleted)`,
    });

    return { deactivatedOnly: true, activeListingsCount };
  }

  category.isDeleted = true;
  category.isActive = false;
  await category.save();

  await logAdminAction({
    adminId: adminInfo.adminId,
    adminName: adminInfo.fullName,
    adminEmail: adminInfo.email,
    action: AUDIT_ACTION.CATEGORY_DELETED,
    targetType: 'Category',
    targetId: category._id,
    targetLabel: category.name.en,
  });

  return { deactivatedOnly: false };
}

/**
 * PUBLIC — buyer ke liye, sirf active categories, tree structure me
 * (top-level ke andar unke children)
 */
async function listPublicCategories() {
  const categories = await Category.find({ isActive: true, isDeleted: false })
    .sort({ displayOrder: 1 })
    .lean();

  const topLevel = categories.filter((c) => !c.parentId);
  const byParent = {};
  categories.forEach((c) => {
    if (c.parentId) {
      const key = c.parentId.toString();
      byParent[key] = byParent[key] || [];
      byParent[key].push(c);
    }
  });

  return topLevel.map((parent) => ({
    ...parent,
    children: byParent[parent._id.toString()] || [],
  }));
}

/**
 * ADMIN — sab categories, active/inactive dono, flat list (edit UI ke liye)
 */
async function adminListCategories() {
  return Category.find({ isDeleted: false }).sort({ displayOrder: 1 });
}

/**
 * Category ka cached listingCount update karta hai. Listing approve hone
 * pe +1, remove/sold/expired hone pe -1 — auction/listing service se
 * call hoga.
 *
 * SCHEMA_NOTES.md ka rule: jo bhi denormalized field hai, uska sync ek
 * hi service call ke andar hona chahiye, alag-alag jagah se nahi.
 */
async function syncListingCount(categoryId, delta) {
  await Category.updateOne({ _id: categoryId }, { $inc: { listingCount: delta } });
}

module.exports = {
  createCategory,
  updateCategory,
  deleteCategory,
  listPublicCategories,
  adminListCategories,
  syncListingCount,
};
