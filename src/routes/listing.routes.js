const express = require('express');
const router = express.Router();

const listingController = require('../controllers/listing.controller');
const validate = require('../middlewares/validate');
const { authenticate, requireRole } = require('../middlewares/authenticate');
const { authenticateAdmin, requirePermission } = require('../middlewares/authenticateAdmin');
const { uploadListingMedia } = require('../middlewares/uploadListingMedia');
const {
  createListingSchema,
  updateListingSchema,
  reviewListingSchema,
} = require('../validators/listing.validator');
const { PERMISSION } = require('../constants/enums');

// ---- Public / Buyer routes ----
// NOTE: ye specific routes /admin/* se PEHLE aane chahiye taaki "/admin"
// ko galti se ek listing slug na samajh liya jaaye
router.get('/browse', listingController.browsePublic);
router.get('/compare', listingController.compare);
router.get('/wishlist/mine', authenticate, listingController.getMyWishlist);
router.get('/detail/:slugOrId', listingController.getPublicDetail);
router.get('/:listingId/related', listingController.getRelated);

// ---- Seller routes ----
router.post(
  '/',
  authenticate,
  requireRole('seller'),
  validate(createListingSchema),
  listingController.createDraft
);
router.get('/mine', authenticate, requireRole('seller'), listingController.getMyListings);
router.patch(
  '/:listingId',
  authenticate,
  requireRole('seller'),
  validate(updateListingSchema),
  listingController.updateDraft
);
router.post(
  '/:listingId/media',
  authenticate,
  requireRole('seller'),
  uploadListingMedia.array('media', 15),
  listingController.addMedia
);
router.post(
  '/:listingId/submit',
  authenticate,
  requireRole('seller'),
  listingController.submitForReview
);
router.delete('/:listingId', authenticate, requireRole('seller'), listingController.removeListing);

// ---- Buyer: Wishlist toggle ----
router.post('/:listingId/wishlist', authenticate, listingController.toggleWishlist);

// ---- Admin routes ----
router.get(
  '/admin/all',
  authenticateAdmin,
  requirePermission(PERMISSION.LISTINGS_VIEW),
  listingController.adminListByStatus
);
router.post(
  '/admin',
  authenticateAdmin,
  requirePermission(PERMISSION.LISTINGS_EDIT),
  uploadListingMedia.array('media', 15),
  listingController.adminCreateListing
);
router.get(
  '/admin/:listingId',
  authenticateAdmin,
  requirePermission(PERMISSION.LISTINGS_VIEW),
  listingController.adminGetOne
);
router.post(
  '/admin/:listingId/review',
  authenticateAdmin,
  requirePermission(PERMISSION.LISTINGS_APPROVE),
  validate(reviewListingSchema),
  listingController.adminReview
);

module.exports = router;
