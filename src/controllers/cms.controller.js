const cmsService = require('../services/cms.service');
const catchAsync = require('../utils/catchAsync');

exports.getPublic = catchAsync(async (req, res) => {
  const page = await cmsService.getPublicPage(req.params.slug);
  res.status(200).json({ success: true, data: page });
});

exports.adminList = catchAsync(async (req, res) => {
  const pages = await cmsService.adminListPages();
  res.status(200).json({ success: true, data: pages });
});

exports.upsert = catchAsync(async (req, res) => {
  const page = await cmsService.upsertPage(req.params.slug, req.body, req.admin);
  res.status(200).json({ success: true, message: 'Page saved successfully', data: page });
});
