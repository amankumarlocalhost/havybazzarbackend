const express = require('express');
const router = express.Router();

const reportController = require('../controllers/report.controller');
const { authenticate, requireRole } = require('../middlewares/authenticate');
const { authenticateAdmin, requirePermission } = require('../middlewares/authenticateAdmin');
const { PERMISSION } = require('../constants/enums');

// ---- Admin ----
router.get(
  '/admin/sales',
  authenticateAdmin,
  requirePermission(PERMISSION.REPORTS_VIEW),
  reportController.adminSales
);
router.get(
  '/admin/auctions',
  authenticateAdmin,
  requirePermission(PERMISSION.REPORTS_VIEW),
  reportController.adminAuctions
);

// ---- Seller ----
router.get('/seller/sales', authenticate, requireRole('seller'), reportController.sellerSales);
router.get('/seller/auctions', authenticate, requireRole('seller'), reportController.sellerAuctions);

module.exports = router;
