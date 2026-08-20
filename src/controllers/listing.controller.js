const listingService = require('../services/listing.service');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { adminCreateListingSchema } = require('../validators/listing.validator');

// ---- Seller side ----

exports.createDraft = catchAsync(async (req, res) => {
  const listing = await listingService.createDraft(req.user.userId, req.body);
  res.status(201).json({ success: true, message: 'Draft created successfully', data: listing });
});

exports.updateDraft = catchAsync(async (req, res) => {
  const listing = await listingService.updateDraft(req.params.listingId, req.user.userId, req.body);
  res.status(200).json({ success: true, message: 'Updated successfully', data: listing });
});

exports.addMedia = catchAsync(async (req, res) => {
  const listing = await listingService.addMedia(req.params.listingId, req.user.userId, req.files);
  res.status(200).json({ success: true, message: 'Media added successfully', data: listing });
});

exports.submitForReview = catchAsync(async (req, res) => {
  const listing = await listingService.submitForReview(req.params.listingId, req.user.userId);
  res.status(200).json({
    success: true,
    message:
      listing.status === 'pending_payment'
        ? 'Awaiting EMD payment (auction listing)'
        : 'Submitted for review',
    data: listing,
  });
});

exports.getMyListings = catchAsync(async (req, res) => {
  const { status, page, limit } = req.query;
  const result = await listingService.getMyListings(req.user.userId, {
    status,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  res.status(200).json({ success: true, data: result });
});

exports.removeListing = catchAsync(async (req, res) => {
  await listingService.removeListing(req.params.listingId, req.user.userId);
  res.status(200).json({ success: true, message: 'Listing removed successfully' });
});

// ---- Buyer side (public) ----

exports.browsePublic = catchAsync(async (req, res) => {
  const { search, categoryId, state, condition, listingType, minPrice, maxPrice, brand, sort, page, limit } =
    req.query;

  const result = await listingService.browsePublic({
    search,
    categoryId,
    state,
    condition,
    listingType,
    minPrice: minPrice ? parseFloat(minPrice) : undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    brand,
    sort,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });

  res.status(200).json({ success: true, data: result });
});

exports.getPublicDetail = catchAsync(async (req, res) => {
  const listing = await listingService.getPublicDetail(req.params.slugOrId);
  res.status(200).json({ success: true, data: listing });
});

// ---- Admin side ----

exports.adminListByStatus = catchAsync(async (req, res) => {
  const { status, page, limit } = req.query;
  const result = await listingService.adminListByStatus({
    status,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  res.status(200).json({ success: true, data: result });
});

exports.adminGetOne = catchAsync(async (req, res) => {
  const result = await listingService.adminGetOne(req.params.listingId);
  res.status(200).json({ success: true, data: result });
});

exports.adminCreateListing = catchAsync(async (req, res) => {
  // Multipart form: text fields JSON string me "data" field ke andar aate
  // hain (files ke saath ek hi request me nested JSON bhejna standard
  // multipart se possible nahi) — yahi pattern kyc.controller.submitDocuments
  // me bhi hai.
  let data;
  try {
    data = req.body.data ? JSON.parse(req.body.data) : {};
  } catch (e) {
    throw new AppError('data must be a valid JSON object', 400);
  }

  const result = adminCreateListingSchema.safeParse(data);
  if (!result.success) {
    throw new AppError(result.error.errors[0].message, 400);
  }

  const listing = await listingService.adminCreateListing(req.admin, result.data, req.files || []);
  res.status(201).json({ success: true, message: 'Listing created and published', data: listing });
});

exports.adminReview = catchAsync(async (req, res) => {
  const { action, reason } = req.body;
  const listing = await listingService.adminReview(req.params.listingId, req.admin, action, reason);
  res.status(200).json({
    success: true,
    message: action === 'approve' ? 'Listing approved and is now live' : 'Listing rejected',
    data: { status: listing.status },
  });
});

// ---- Wishlist ----

exports.toggleWishlist = catchAsync(async (req, res) => {
  const result = await listingService.toggleWishlist(req.user.userId, req.params.listingId);
  res.status(200).json({
    success: true,
    message: result.added ? 'Added to wishlist' : 'Removed from wishlist',
    data: result,
  });
});

exports.getMyWishlist = catchAsync(async (req, res) => {
  const wishlist = await listingService.getMyWishlist(req.user.userId);
  res.status(200).json({ success: true, data: wishlist });
});

// ---- Related & Comparison ----

exports.getRelated = catchAsync(async (req, res) => {
  const related = await listingService.getRelatedListings(req.params.listingId);
  res.status(200).json({ success: true, data: related });
});

exports.compare = catchAsync(async (req, res) => {
  const idsParam = req.query.ids; // "id1,id2,id3"
  const listingIds = idsParam ? idsParam.split(',') : [];
  const listings = await listingService.compareListings(listingIds);
  res.status(200).json({ success: true, data: listings });
});
