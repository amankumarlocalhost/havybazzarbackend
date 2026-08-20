/**
 * dashboard.service.js
 * ---------------------------------------------------------------------------
 * Doc ka module: "Overview of Platform Performance" — active users, total
 * transactions, total listings, upcoming auctions, recent activity, revenue.
 *
 * Revenue = admin commission (Order.commissionPaise). Ye asli paisa hai
 * jo har order pe admin ka 1%+1% cut hota hai (BUSINESS_RULES.COMMISSION_BPS_*,
 * dekhiye order.service.js ka calculateCommissionSplit()) — GMV (total order
 * value) nahi, kyunki wo seller ka paisa hai, admin ka revenue nahi.
 * ---------------------------------------------------------------------------
 */

const User = require('../models/user.model');
const Listing = require('../models/listing.model');
const Order = require('../models/order.model');
const Auction = require('../models/auction.model');
const KycVerification = require('../models/kyc.model');
const AuditLog = require('../models/auditLog.model');
const { USER_ROLE, LISTING_STATUS, KYC_STATUS, AUCTION_STATUS } = require('../constants/enums');

async function getStats() {
  const [
    totalUsers,
    totalBuyers,
    totalSellers,
    totalDevices,
    activeListings,
    pendingListingReview,
    pendingKyc,
    totalOrders,
    liveAuctions,
    scheduledAuctions,
    revenueAgg,
  ] = await Promise.all([
    User.countDocuments({ isDeleted: false }),
    User.countDocuments({ roles: USER_ROLE.BUYER, isDeleted: false }),
    User.countDocuments({ roles: USER_ROLE.SELLER, isDeleted: false }),
    Listing.countDocuments({ isDeleted: false }),
    Listing.countDocuments({ status: LISTING_STATUS.ACTIVE, isDeleted: false }),
    Listing.countDocuments({ status: LISTING_STATUS.UNDER_REVIEW, isDeleted: false }),
    KycVerification.countDocuments({ status: KYC_STATUS.SUBMITTED }),
    Order.countDocuments({}),
    Auction.countDocuments({ status: AUCTION_STATUS.LIVE }),
    Auction.countDocuments({ status: AUCTION_STATUS.SCHEDULED }),
    Order.aggregate([{ $group: { _id: null, total: { $sum: '$commissionPaise' } } }]),
  ]);

  return {
    totalUsers,
    totalDevices,
    totalOrders,
    totalRevenuePaise: revenueAgg[0]?.total || 0,
    users: { totalBuyers, totalSellers },
    listings: { active: activeListings, pendingReview: pendingListingReview, total: totalDevices },
    kyc: { pending: pendingKyc },
    auctions: { live: liveAuctions, upcoming: scheduledAuctions },
  };
}

/**
 * Weekly revenue trend — Dashboard ke area chart ke liye. `weeks` = kitne
 * hafte peeche tak, aaj se (aaj wale haftey samet).
 */
async function getRevenueTrend(weeks = 5) {
  const now = new Date();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now.getTime() - i * WEEK_MS);
    const start = new Date(end.getTime() - WEEK_MS);
    buckets.push({ start, end, label: `Week${weeks - i}` });
  }

  const results = await Promise.all(
    buckets.map(async ({ start, end, label }) => {
      const agg = await Order.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: '$commissionPaise' } } },
      ]);
      return { label, revenuePaise: agg[0]?.total || 0 };
    })
  );

  return results;
}

async function getRecentActivity(limit = 20) {
  return AuditLog.find().sort({ createdAt: -1 }).limit(limit);
}

module.exports = { getStats, getRevenueTrend, getRecentActivity };
