const express = require('express');
const router = express.Router();

const categoryController = require('../controllers/category.controller');
const validate = require('../middlewares/validate');
const { authenticateAdmin, requirePermission } = require('../middlewares/authenticateAdmin');
const { createCategorySchema, updateCategorySchema } = require('../validators/category.validator');
const { PERMISSION } = require('../constants/enums');

// ---- Public ----
router.get('/', categoryController.listPublic);

// ---- Admin ----
router.get(
  '/admin/all',
  authenticateAdmin,
  requirePermission(PERMISSION.CATEGORIES_MANAGE),
  categoryController.adminList
);
router.post(
  '/admin',
  authenticateAdmin,
  requirePermission(PERMISSION.CATEGORIES_MANAGE),
  validate(createCategorySchema),
  categoryController.create
);
router.patch(
  '/admin/:categoryId',
  authenticateAdmin,
  requirePermission(PERMISSION.CATEGORIES_MANAGE),
  validate(updateCategorySchema),
  categoryController.update
);
router.delete(
  '/admin/:categoryId',
  authenticateAdmin,
  requirePermission(PERMISSION.CATEGORIES_MANAGE),
  categoryController.remove
);

module.exports = router;
