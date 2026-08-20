const CmsPage = require('../models/cmsPage.model');
const AppError = require('../utils/AppError');
const { logAdminAction } = require('./auditLog.service');
const { AUDIT_ACTION } = require('../constants/enums');

async function getPublicPage(slug) {
  const page = await CmsPage.findOne({ slug, isPublished: true });
  if (!page) throw new AppError('Page not found.', 404);
  return page;
}

async function adminListPages() {
  return CmsPage.find().sort({ slug: 1 });
}

/**
 * Upsert — page exist kare to update, na kare to create. Admin ke liye
 * ek hi endpoint kaafi hai, alag create/update ka jhanjhat nahi.
 */
async function upsertPage(slug, data, adminInfo) {
  const page = await CmsPage.findOneAndUpdate(
    { slug },
    { ...data, slug, updatedByAdminId: adminInfo.adminId },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await logAdminAction({
    adminId: adminInfo.adminId,
    adminName: adminInfo.fullName,
    adminEmail: adminInfo.email,
    action: AUDIT_ACTION.CMS_PAGE_UPDATED,
    targetType: 'CmsPage',
    targetId: page._id,
    targetLabel: slug,
  });

  return page;
}

module.exports = { getPublicPage, adminListPages, upsertPage };
