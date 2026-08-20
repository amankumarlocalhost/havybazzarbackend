const express = require('express');
const router = express.Router();

const cmsController = require('../controllers/cms.controller');
const validate = require('../middlewares/validate');
const { authenticateAdmin, requirePermission } = require('../middlewares/authenticateAdmin');
const { upsertCmsPageSchema } = require('../validators/cms.validator');
const { PERMISSION } = require('../constants/enums');

// ---- Public ----
router.get('/:slug', cmsController.getPublic);

// ---- Admin ----
router.get(
  '/admin/all',
  authenticateAdmin,
  requirePermission(PERMISSION.CMS_MANAGE),
  cmsController.adminList
);
router.put(
  '/admin/:slug',
  authenticateAdmin,
  requirePermission(PERMISSION.CMS_MANAGE),
  validate(upsertCmsPageSchema),
  cmsController.upsert
);

module.exports = router;
