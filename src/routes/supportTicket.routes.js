const express = require('express');
const router = express.Router();

const ticketController = require('../controllers/supportTicket.controller');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { authenticateAdmin, requirePermission } = require('../middlewares/authenticateAdmin');
const { createTicketSchema, replySchema, updateStatusSchema } = require('../validators/supportTicket.validator');
const { PERMISSION } = require('../constants/enums');

// ---- User ----
router.post('/', authenticate, validate(createTicketSchema), ticketController.create);
router.get('/mine', authenticate, ticketController.getMine);
router.get('/:ticketId', authenticate, ticketController.getOne);
router.post('/:ticketId/reply', authenticate, validate(replySchema), ticketController.replyAsUser);

// ---- Admin ----
router.get(
  '/admin/all',
  authenticateAdmin,
  requirePermission(PERMISSION.SUPPORT_MANAGE),
  ticketController.adminList
);
router.get(
  '/admin/:ticketId',
  authenticateAdmin,
  requirePermission(PERMISSION.SUPPORT_MANAGE),
  ticketController.adminGetOne
);
router.post(
  '/admin/:ticketId/reply',
  authenticateAdmin,
  requirePermission(PERMISSION.SUPPORT_MANAGE),
  validate(replySchema),
  ticketController.adminReply
);
router.patch(
  '/admin/:ticketId/status',
  authenticateAdmin,
  requirePermission(PERMISSION.SUPPORT_MANAGE),
  validate(updateStatusSchema),
  ticketController.adminUpdateStatus
);

module.exports = router;
