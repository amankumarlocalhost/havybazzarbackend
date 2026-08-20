/**
 * listing.service.js
 * ---------------------------------------------------------------------------
 * State machine (enums.js se): draft -> pending_payment (auction only)
 *   -> under_review -> approved -> active -> sold/expired/removed
 *                                -> rejected
 *
 * NOTE — AUCTION EMD ABHI CONNECT NAHI HAI:
 * Doc ka rule hai auction listing publish karne se pehle seller ko EMD
 * dena hoga. Payment integration Phase 7 me banega. Isliye abhi auction
 * listing submit karne pe status "pending_payment" pe ruk jaayega —
 * `markSellerEmdPaid()` function Phase 7 ka payment webhook call karega
 * taaki wo "under_review" me aage badhe. Fixed-price listings is wait
 * se guzarti hi nahi, seedha under_review jaati hain.
 * ---------------------------------------------------------------------------
 */

const Listing = require('../models/listing.model');
const Category = require('../models/category.model');
const Auction = require('../models/auction.model');
const User = require('../models/user.model');
const AppError = require('../utils/AppError');
const { generateUniqueSlug } = require('../utils/slugify');
const { uploadBuffer } = require('./upload.service');
const { logAdminAction } = require('./auditLog.service');
const categoryService = require('./category.service');
const { calculateEmdAmountPaise } = require('../utils/auctionMath');
const {
  LISTING_STATUS,
  LISTING_TYPE,
  AUDIT_ACTION,
  AUCTION_STATUS,
  BUSINESS_RULES,
  USER_ROLE,
  KYC_STATUS,
} = require('../constants/enums');

const RUPEES_TO_PAISE = 100;

// -----------------------------------------------------------------------
// SELLER SIDE
// -----------------------------------------------------------------------

async function createDraft(sellerId, data) {
  const category = await Category.findById(data.categoryId);
  if (!category || !category.isActive) {
    throw new AppError('Category not found or not active.', 400);
  }

  const slug = await generateUniqueSlug(Listing, data.title);

  const listingData = {
    sellerId,
    title: data.title,
    slug,
    description: data.description,
    categoryId: data.categoryId,
    condition: data.condition,
    location: data.location,
    vehicleRegistrationNumber: data.vehicleRegistrationNumber,
    specifications: data.specifications || {},
    listingType: data.listingType,
    status: LISTING_STATUS.DRAFT,
  };

  if (data.listingType === LISTING_TYPE.FIXED_PRICE) {
    listingData.fixedPricePaise = Math.round(data.fixedPrice * RUPEES_TO_PAISE);
    listingData.totalQuantity = data.quantity || 1;
    listingData.quantityAvailable = data.quantity || 1;
  }

  const listing = await Listing.create(listingData);

  /**
   * AUCTION LISTING: auctionConfig (starting bid, increment, reserve,
   * timing) yahin Auction collection me persist hota hai — Phase 4 me
   * ye field receive hota tha par kahin save nahi hota tha (comment
   * kehta tha "Phase 6 me use hoga" par actual code missing tha). Ab
   * fix ho gaya: listing draft banate hi Auction bhi ban jaata hai,
   * `status: scheduled` me — jab tak seller EMD na de aur admin
   * approve na kare, wo live nahi hoga.
   */
  if (data.listingType === LISTING_TYPE.AUCTION) {
    const startingBidPaise = Math.round(data.auctionConfig.startingBid * RUPEES_TO_PAISE);
    const minIncrementPaise = Math.round(data.auctionConfig.minBidIncrement * RUPEES_TO_PAISE);
    const reservePricePaise = data.auctionConfig.reservePrice
      ? Math.round(data.auctionConfig.reservePrice * RUPEES_TO_PAISE)
      : undefined;

    const auction = await Auction.create({
      listingId: listing._id,
      sellerId,
      status: AUCTION_STATUS.SCHEDULED,
      startingBidPaise,
      minIncrementPaise,
      reservePricePaise,
      startTime: new Date(data.auctionConfig.startTime),
      originalEndTime: new Date(data.auctionConfig.endTime),
      endTime: new Date(data.auctionConfig.endTime),
      // Buyer EMD — startingBidPaise ka % (SCHEMA_NOTES.md ka open sawal,
      // defensible default ke saath — dekhiye auction.model.js ka comment)
      emdAmountPaise: calculateEmdAmountPaise(startingBidPaise, BUSINESS_RULES.EMD_BPS_BUYER),
    });

    listing.auctionId = auction._id;

    // Seller ka apna EMD bhi isi base pe — Phase 7 ka payment ise "paid" karega
    listing.sellerEmdAmountPaise = calculateEmdAmountPaise(startingBidPaise, BUSINESS_RULES.EMD_BPS_SELLER);
    await listing.save();
  }

  return listing;
}

async function updateDraft(listingId, sellerId, data) {
  const listing = await Listing.findOne({ _id: listingId, sellerId, isDeleted: false });
  if (!listing) throw new AppError('Listing not found.', 404);

  // Sirf draft ya rejected state me edit allowed — live listing beech me
  // nahi badalni chahiye (buyer ne dekh li hogi, bharosa toot sakta hai)
  if (![LISTING_STATUS.DRAFT, LISTING_STATUS.REJECTED].includes(listing.status)) {
    throw new AppError(`This listing cannot be edited while in "${listing.status}" state.`, 400);
  }

  if (data.title) listing.title = data.title;
  if (data.description !== undefined) listing.description = data.description;
  if (data.condition) listing.condition = data.condition;
  if (data.fixedPrice) listing.fixedPricePaise = Math.round(data.fixedPrice * RUPEES_TO_PAISE);
  if (data.quantity && listing.listingType === LISTING_TYPE.FIXED_PRICE) {
    listing.totalQuantity = data.quantity;
    listing.quantityAvailable = data.quantity;
  }
  if (data.specifications) {
    listing.specifications = { ...listing.specifications.toObject(), ...data.specifications };
  }

  // Reject hone ke baad dobara edit kiya to wapas draft me chala jaayega
  if (listing.status === LISTING_STATUS.REJECTED) {
    listing.status = LISTING_STATUS.DRAFT;
    listing.rejectionReason = undefined;
  }

  await listing.save();
  return listing;
}

/**
 * Media (photos/videos) upload — Cloudinary PUBLIC (listing photos website
 * pe seedha dikhengi, KYC docs jaise private nahi).
 */
async function addMedia(listingId, sellerId, files, mediaType = 'image') {
  const listing = await Listing.findOne({ _id: listingId, sellerId, isDeleted: false });
  if (!listing) throw new AppError('Listing not found.', 404);

  if (![LISTING_STATUS.DRAFT, LISTING_STATUS.REJECTED].includes(listing.status)) {
    throw new AppError('Media can only be added to a draft listing.', 400);
  }

  const startOrder = listing.media.length;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const resourceType = file.mimetype.startsWith('video') ? 'video' : 'image';

    const result = await uploadBuffer(file.buffer, {
      folder: `listings/${listingId}`,
      isPrivate: false, // listing photos PUBLIC hain — website pe seedha dikhengi
      resourceType,
    });

    listing.media.push({
      type: resourceType,
      fileKey: result.public_id,
      displayOrder: startOrder + i,
    });
  }

  await listing.save();
  return listing;
}

/**
 * Draft se review ke liye bhejna. Yahin pe business rules ka FINAL check
 * hota hai (validator ne bhi check kiya, par yahan double-check —
 * defense in depth, kyunki draft kai step me bana ho sakta hai).
 */
async function submitForReview(listingId, sellerId) {
  const listing = await Listing.findOne({ _id: listingId, sellerId, isDeleted: false });
  if (!listing) throw new AppError('Listing not found.', 404);

  if (![LISTING_STATUS.DRAFT, LISTING_STATUS.REJECTED].includes(listing.status)) {
    throw new AppError(`Cannot submit from "${listing.status}" state.`, 400);
  }

  if (listing.media.length === 0) {
    throw new AppError('You must upload at least one photo.', 400);
  }

  if (listing.listingType === LISTING_TYPE.AUCTION) {
    // EMD abhi pending hai — Phase 7 ka payment flow isko aage badhaayega
    listing.status = LISTING_STATUS.PENDING_PAYMENT;
  } else {
    listing.status = LISTING_STATUS.UNDER_REVIEW;
    listing.submittedForReviewAt = new Date();
  }

  await listing.save();
  return listing;
}

/**
 * PHASE 7 STUB: seller ne auction ka EMD pay kar diya. Ye function abhi
 * kahin route se call nahi hoti — payment webhook se call hogi jab
 * Phase 7 banega. Yahan rakh diya taaki state machine ka agla step
 * pehle se defined ho.
 */
async function markSellerEmdPaid(listingId) {
  const listing = await Listing.findById(listingId);
  if (!listing) throw new AppError('Listing not found.', 404);

  if (listing.status !== LISTING_STATUS.PENDING_PAYMENT) {
    throw new AppError('This listing is not awaiting EMD payment.', 400);
  }

  listing.sellerEmdPaid = true;
  listing.status = LISTING_STATUS.UNDER_REVIEW;
  listing.submittedForReviewAt = new Date();
  await listing.save();
  return listing;
}

async function getMyListings(sellerId, { status, page = 1, limit = 20 }) {
  const query = { sellerId, isDeleted: false };
  if (status) query.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Listing.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Listing.countDocuments(query),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function removeListing(listingId, sellerId) {
  const listing = await Listing.findOne({ _id: listingId, sellerId, isDeleted: false });
  if (!listing) throw new AppError('Listing not found.', 404);

  const wasActive = listing.status === LISTING_STATUS.ACTIVE;

  listing.isDeleted = true;
  listing.status = LISTING_STATUS.REMOVED;
  listing.deletedAt = new Date();
  await listing.save();

  if (wasActive) {
    await categoryService.syncListingCount(listing.categoryId, -1);
  }

  return listing;
}

// -----------------------------------------------------------------------
// BUYER SIDE (public)
// -----------------------------------------------------------------------

/**
 * Search, filter, sort, pagination — sab ek function me.
 *
 * NOTE: offset-based pagination (page/limit) use kiya hai, cursor-based
 * nahi — consistency ke liye baaki modules (KYC admin list) ke saath.
 * Bahut bade dataset (lakhon listings) pe cursor-based better hoga —
 * abhi ke scale ke liye ye kaafi hai.
 */
async function browsePublic(filters) {
  const {
    search,
    categoryId,
    state,
    condition,
    listingType,
    minPrice,
    maxPrice,
    brand,
    sort = 'newest',
    page = 1,
    limit = 20,
  } = filters;

  const query = { status: LISTING_STATUS.ACTIVE, isDeleted: false };

  if (categoryId) query.categoryId = categoryId;
  if (state) query['location.state'] = state;
  if (condition) query.condition = condition;
  if (listingType) query.listingType = listingType;
  if (brand) query['specifications.general.brand'] = new RegExp(brand, 'i');

  if (minPrice || maxPrice) {
    query.fixedPricePaise = {};
    if (minPrice) query.fixedPricePaise.$gte = Math.round(minPrice * RUPEES_TO_PAISE);
    if (maxPrice) query.fixedPricePaise.$lte = Math.round(maxPrice * RUPEES_TO_PAISE);
  }

  if (search) {
    query.$text = { $search: search };
  }

  const sortMap = {
    newest: { createdAt: -1 },
    price_asc: { fixedPricePaise: 1 },
    price_desc: { fixedPricePaise: -1 },
    popular: { viewCount: -1 },
  };
  const sortOption = sortMap[sort] || sortMap.newest;

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Listing.find(query)
      .select('-specifications.general.serialNumber') // extra safety, already select:false in schema
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate('categoryId', 'name slug'),
    Listing.countDocuments(query),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Ek listing ki detail. View count ATOMIC increment se badhta hai
 * ($inc) — read-modify-write se NAHI, warna concurrent views me
 * kuch views count hi nahi honge (SCHEMA_NOTES.md ka rule).
 */
async function getPublicDetail(slugOrId) {
  const query = {
    isDeleted: false,
    status: LISTING_STATUS.ACTIVE,
    $or: [{ slug: slugOrId }, ...(isValidObjectId(slugOrId) ? [{ _id: slugOrId }] : [])],
  };

  const listing = await Listing.findOne(query).populate('categoryId', 'name slug');
  if (!listing) throw new AppError('Listing not found.', 404);

  // Fire-and-forget atomic increment — response ka wait nahi karta
  Listing.updateOne({ _id: listing._id }, { $inc: { viewCount: 1 } }).exec();

  return listing;
}

function isValidObjectId(id) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

// -----------------------------------------------------------------------
// ADMIN SIDE
// -----------------------------------------------------------------------

async function adminListByStatus({ status, page = 1, limit = 20 }) {
  const query = { isDeleted: false };
  if (status && status !== 'all') query.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Listing.find(query)
      .sort({ submittedForReviewAt: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sellerId', 'fullName email phone')
      .populate('categoryId', 'name slug'),
    Listing.countDocuments(query),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * ADMIN — ek listing ki POORI detail. Public getPublicDetail() se alag hai:
 * yahan status kuch bhi ho sakta hai (draft/rejected/expired bhi), aur
 * normally-hidden fields (vehicleRegistrationNumber, serialNumber) bhi
 * saath aate hain — admin ko dispute resolution ke liye poora context
 * chahiye, "kya tha kya nahi" poori history samet.
 */
async function adminGetOne(listingId) {
  const listing = await Listing.findOne({ _id: listingId })
    .select('+vehicleRegistrationNumber +specifications.general.serialNumber')
    .populate('sellerId', 'fullName email phone kycStatus')
    .populate('categoryId', 'name slug')
    .populate('reviewedByAdminId', 'fullName email')
    .populate({
      path: 'auctionId',
      populate: [
        { path: 'currentLeaderId', select: 'fullName email' },
        { path: 'winnerId', select: 'fullName email' },
      ],
    });

  if (!listing) throw new AppError('Listing not found.', 404);

  let order = null;
  if (listing.status === LISTING_STATUS.SOLD) {
    const Order = require('../models/order.model');
    order = await Order.findOne({ listingId: listing._id })
      .populate('buyerId', 'fullName email phone')
      .sort({ createdAt: -1 });
  }

  return { listing, order };
}

/**
 * ADMIN — seller ki taraf se seedha listing banata hai, aur turant ACTIVE
 * kar deta hai. Normal seller flow (draft -> submit -> review -> approve,
 * auction ke liye beech me EMD bhi) yahan skip hota hai — admin trusted
 * hai, isliye seedha live.
 */
async function adminCreateListing(adminInfo, data, files = []) {
  const seller = await User.findById(data.sellerId);
  if (!seller) throw new AppError('Seller not found.', 404);
  if (!seller.roles.includes(USER_ROLE.SELLER)) {
    throw new AppError('This user does not have the seller role.', 400);
  }
  if (seller.kycStatus !== KYC_STATUS.VERIFIED) {
    throw new AppError('Seller must have verified KYC.', 400);
  }

  const category = await Category.findById(data.categoryId);
  if (!category || !category.isActive) {
    throw new AppError('Category not found or not active.', 400);
  }

  const slug = await generateUniqueSlug(Listing, data.title);
  const now = new Date();

  const listing = await Listing.create({
    sellerId: data.sellerId,
    title: data.title,
    slug,
    description: data.description,
    categoryId: data.categoryId,
    condition: data.condition,
    location: data.location,
    vehicleRegistrationNumber: data.vehicleRegistrationNumber,
    specifications: data.specifications || {},
    listingType: data.listingType,
    status: LISTING_STATUS.ACTIVE,
    submittedForReviewAt: now,
    approvedAt: now,
    reviewedByAdminId: adminInfo.adminId,
  });

  if (data.listingType === LISTING_TYPE.FIXED_PRICE) {
    listing.fixedPricePaise = Math.round(data.fixedPrice * RUPEES_TO_PAISE);
    listing.totalQuantity = data.quantity || 1;
    listing.quantityAvailable = data.quantity || 1;
  }

  if (data.listingType === LISTING_TYPE.AUCTION) {
    const startingBidPaise = Math.round(data.auctionConfig.startingBid * RUPEES_TO_PAISE);
    const minIncrementPaise = Math.round(data.auctionConfig.minBidIncrement * RUPEES_TO_PAISE);
    const reservePricePaise = data.auctionConfig.reservePrice
      ? Math.round(data.auctionConfig.reservePrice * RUPEES_TO_PAISE)
      : undefined;

    const auction = await Auction.create({
      listingId: listing._id,
      sellerId: data.sellerId,
      status: AUCTION_STATUS.SCHEDULED,
      startingBidPaise,
      minIncrementPaise,
      reservePricePaise,
      startTime: new Date(data.auctionConfig.startTime),
      originalEndTime: new Date(data.auctionConfig.endTime),
      endTime: new Date(data.auctionConfig.endTime),
      emdAmountPaise: calculateEmdAmountPaise(startingBidPaise, BUSINESS_RULES.EMD_BPS_BUYER),
    });

    listing.auctionId = auction._id;
    // Admin ne seedha banaya hai — seller EMD ki requirement skip
    listing.sellerEmdAmountPaise = calculateEmdAmountPaise(startingBidPaise, BUSINESS_RULES.EMD_BPS_SELLER);
    listing.sellerEmdPaid = true;

    const auctionService = require('./auction.service');
    try {
      await auctionService.scheduleAuctionJobs(auction._id, auction.startTime, auction.endTime);
    } catch (err) {
      console.error(`Failed to schedule auction jobs for ${auction._id}:`, err.message);
    }
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const resourceType = file.mimetype.startsWith('video') ? 'video' : 'image';

    const result = await uploadBuffer(file.buffer, {
      folder: `listings/${listing._id}`,
      isPrivate: false,
      resourceType,
    });

    listing.media.push({ type: resourceType, fileKey: result.public_id, displayOrder: i });
  }

  await listing.save();
  await categoryService.syncListingCount(listing.categoryId, 1);

  await logAdminAction({
    adminId: adminInfo.adminId,
    adminName: adminInfo.fullName,
    adminEmail: adminInfo.email,
    action: AUDIT_ACTION.LISTING_CREATED_BY_ADMIN,
    targetType: 'Listing',
    targetId: listing._id,
    targetLabel: listing.title,
    changesAfter: { status: listing.status, sellerId: String(data.sellerId) },
  });

  const notificationService = require('./notification.service');
  await notificationService.notify(seller._id, 'listing_approved', { title: listing.title });

  return listing;
}

async function adminReview(listingId, adminInfo, action, reason) {
  const listing = await Listing.findById(listingId);
  if (!listing) throw new AppError('Listing not found.', 404);

  if (listing.status !== LISTING_STATUS.UNDER_REVIEW) {
    throw new AppError(`This listing cannot be reviewed while in "${listing.status}" state.`, 400);
  }

  const beforeStatus = listing.status;

  if (action === 'approve') {
    listing.status = LISTING_STATUS.ACTIVE;
    listing.approvedAt = new Date();
    listing.reviewedByAdminId = adminInfo.adminId;

    await categoryService.syncListingCount(listing.categoryId, 1);

    // Auction listing approve hui to uske start/close BullMQ jobs
    // schedule karo — yahi se auction ki lifecycle actually shuru hoti hai
    if (listing.listingType === LISTING_TYPE.AUCTION && listing.auctionId) {
      // Late require — circular dependency se bachne ke liye
      // (auction.service.js listing.model ko directly use karta hai,
      // listing.service.js ko nahi, isliye ye cycle nahi hai — par phir
      // bhi late require se safe rehte hain)
      const auctionService = require('./auction.service');
      const auction = await Auction.findById(listing.auctionId);
      if (auction) {
        // Redis/BullMQ down ho to ye request hang/fail nahi honi chahiye —
        // approve ho chuka hai, listing already ACTIVE hai. Agar job
        // schedule nahi ho paayi, `auctionReconciliationCron.js` (jo har
        // minute chalta hai) safety net ki tarah pakad lega.
        try {
          await auctionService.scheduleAuctionJobs(auction._id, auction.startTime, auction.endTime);
        } catch (err) {
          console.error(`Failed to schedule auction jobs for ${auction._id}:`, err.message);
        }
      }
    }
  } else {
    listing.status = LISTING_STATUS.REJECTED;
    listing.rejectedAt = new Date();
    listing.rejectionReason = reason;
    listing.reviewedByAdminId = adminInfo.adminId;
  }

  await listing.save();

  await logAdminAction({
    adminId: adminInfo.adminId,
    adminName: adminInfo.fullName,
    adminEmail: adminInfo.email,
    action: action === 'approve' ? AUDIT_ACTION.LISTING_APPROVED : AUDIT_ACTION.LISTING_REJECTED,
    targetType: 'Listing',
    targetId: listing._id,
    targetLabel: listing.title,
    changesBefore: { status: beforeStatus },
    changesAfter: { status: listing.status },
    reason,
  });

  const notificationService = require('./notification.service');
  await notificationService.notify(listing.sellerId, action === 'approve' ? 'listing_approved' : 'listing_rejected', {
    title: listing.title,
    reason,
  });

  return listing;
}

// -----------------------------------------------------------------------
// WISHLIST — doc ka rule: "Save equipment to Wishlist for easy access"
// -----------------------------------------------------------------------

async function toggleWishlist(userId, listingId) {
  const listing = await Listing.findOne({ _id: listingId, isDeleted: false });
  if (!listing) throw new AppError('Listing not found.', 404);

  const user = await User.findById(userId);
  const index = user.wishlist.findIndex((id) => id.toString() === listingId);

  let added;
  if (index === -1) {
    user.wishlist.push(listingId);
    added = true;
  } else {
    user.wishlist.splice(index, 1);
    added = false;
  }

  await user.save();
  return { added };
}

async function getMyWishlist(userId) {
  const user = await User.findById(userId).populate({
    path: 'wishlist',
    match: { isDeleted: false },
    select: 'title media fixedPricePaise listingType status',
  });
  return user.wishlist;
}

// -----------------------------------------------------------------------
// RELATED EQUIPMENT — doc ka rule: "suggesting similar equipment"
// -----------------------------------------------------------------------

async function getRelatedListings(listingId, limit = 6) {
  const listing = await Listing.findById(listingId);
  if (!listing) return [];

  return Listing.find({
    _id: { $ne: listingId },
    categoryId: listing.categoryId,
    status: LISTING_STATUS.ACTIVE,
    isDeleted: false,
  })
    .limit(limit)
    .select('title media fixedPricePaise listingType');
}

// -----------------------------------------------------------------------
// EQUIPMENT COMPARISON — doc ka rule: "compare selected equipment"
// -----------------------------------------------------------------------

async function compareListings(listingIds) {
  if (listingIds.length < 2 || listingIds.length > 4) {
    throw new AppError('Select 2-4 listings to compare.', 400);
  }

  return Listing.find({
    _id: { $in: listingIds },
    status: LISTING_STATUS.ACTIVE,
    isDeleted: false,
  }).select('-vehicleRegistrationNumber -specifications.general.serialNumber');
}

module.exports = {
  createDraft,
  updateDraft,
  addMedia,
  submitForReview,
  markSellerEmdPaid,
  getMyListings,
  removeListing,
  browsePublic,
  getPublicDetail,
  adminListByStatus,
  adminGetOne,
  adminCreateListing,
  adminReview,
  toggleWishlist,
  getMyWishlist,
  getRelatedListings,
  compareListings,
};
