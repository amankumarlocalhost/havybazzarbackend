const express = require('express');
const router = express.Router();

const withdrawalController = require('../controllers/withdrawal.controller');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { authenticateAdmin, requirePermission } = require('../middlewares/authenticateAdmin');
const { requestWithdrawalSchema, rejectWithdrawalSchema } = require('../validators/withdrawal.validator');
const { PERMISSION } = require('../constants/enums');

router.post('/', authenticate, validate(requestWithdrawalSchema), withdrawalController.request);
router.get('/mine', authenticate, withdrawalController.myWithdrawals);

router.get(
  '/admin/pending',
  authenticateAdmin,
  requirePermission(PERMISSION.WITHDRAWALS_APPROVE),
  withdrawalController.adminListPending
);
router.post(
  '/admin/:withdrawalId/approve',
  authenticateAdmin,
  requirePermission(PERMISSION.WITHDRAWALS_APPROVE),
  withdrawalController.approve
);
router.post(
  '/admin/:withdrawalId/reject',
  authenticateAdmin,
  requirePermission(PERMISSION.WITHDRAWALS_APPROVE),
  validate(rejectWithdrawalSchema),
  withdrawalController.reject
);

module.exports = router;
