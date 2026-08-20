const express = require('express');
const router = express.Router();

const orderController = require('../controllers/order.controller');
const validate = require('../middlewares/validate');
const { authenticate, requireRole } = require('../middlewares/authenticate');
const { authenticateAdmin, requirePermission } = require('../middlewares/authenticateAdmin');
const { updateOrderStatusSchema } = require('../validators/order.validator');
const { PERMISSION } = require('../constants/enums');

router.get('/mine', authenticate, requireRole('buyer'), orderController.getMyOrders);
router.get('/seller', authenticate, requireRole('seller'), orderController.getSellerOrders);
router.post('/:orderId/invoice', authenticate, orderController.generateInvoice);
router.get('/:orderId/invoice/download', authenticate, orderController.downloadInvoice);

router.get(
  '/admin/all',
  authenticateAdmin,
  requirePermission(PERMISSION.ORDERS_VIEW),
  orderController.adminListOrders
);

router.patch(
  '/admin/:orderId/status',
  authenticateAdmin,
  requirePermission(PERMISSION.ORDERS_MANAGE),
  validate(updateOrderStatusSchema),
  orderController.adminUpdateStatus
);

module.exports = router;
