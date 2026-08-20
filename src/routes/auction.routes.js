const express = require('express');
const router = express.Router();

const auctionController = require('../controllers/auction.controller');
const validate = require('../middlewares/validate');
const { authenticate, requireRole } = require('../middlewares/authenticate');
const { authenticateAdmin, requirePermission } = require('../middlewares/authenticateAdmin');
const { bidLimiter } = require('../middlewares/rateLimiter');
const { placeBidSchema, setAutoBidSchema } = require('../validators/auction.validator');
const { PERMISSION } = require('../constants/enums');

// NOTE: /mine/bids aur /admin/all specific routes /:auctionId se PEHLE
// aane chahiye taaki "mine"/"admin" ko galti se auctionId na samajh liya jaaye
router.get('/mine/bids', authenticate, auctionController.getMyBids);
router.get(
  '/admin/all',
  authenticateAdmin,
  requirePermission(PERMISSION.LISTINGS_VIEW),
  auctionController.adminList
);

router.get('/:auctionId', auctionController.getDetail); // public — koi bhi dekh sakta hai

// NOTE: pehle yahan ek "free join" route tha jo bina payment ke EMD maan
// leta tha (Phase 6 ka stub). Ab asli payment flow /api/v1/payments se
// hota hai — dekhiye payment.routes.js ka "/emd/buyer/:auctionId/initiate"
router.post(
  '/:auctionId/bid',
  authenticate,
  requireRole('buyer'),
  bidLimiter,
  validate(placeBidSchema),
  auctionController.placeBid
);
router.post(
  '/:auctionId/auto-bid',
  authenticate,
  requireRole('buyer'),
  bidLimiter,
  validate(setAutoBidSchema),
  auctionController.setAutoBid
);

module.exports = router;
