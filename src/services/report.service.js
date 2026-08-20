/**
 * report.service.js
 * ---------------------------------------------------------------------------
 * Doc ke reports modules: "Sales Reports", "Financial Reports: Monitor
 * revenue", "Auction Activity Summary". MongoDB aggregation pipelines
 * se seedha calculate karte hain — abhi scale chhota hai to live
 * aggregation theek hai. Bahut zyada orders ho jaayein (lakhon) to
 * SCHEMA_NOTES.md ke rule ke hisaab se pre-computed daily rollup
 * collection banani padegi — abhi zaroorat nahi.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const Order = require('../models/order.model');
const Auction = require('../models/auction.model');

function buildDateRangeMatch(field, from, to) {
  const match = {};
  if (from || to) {
    match[field] = {};
    if (from) match[field].$gte = new Date(from);
    if (to) match[field].$lte = new Date(to);
  }
  return match;
}

/**
 * ADMIN — poore platform ka sales + commission summary
 */
async function getAdminSalesReport({ from, to }) {
  const dateMatch = buildDateRangeMatch('createdAt', from, to);

  const result = await Order.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenuePaise: { $sum: '$totalAmountPaise' },
        totalCommissionPaise: { $sum: '$commissionPaise' },
      },
    },
  ]);

  const byStatus = await Order.aggregate([{ $match: dateMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]);

  return {
    summary: result[0] || { totalOrders: 0, totalRevenuePaise: 0, totalCommissionPaise: 0 },
    byStatus,
  };
}

/**
 * ADMIN — Auction Activity Summary
 */
async function getAdminAuctionSummary({ from, to }) {
  const dateMatch = buildDateRangeMatch('createdAt', from, to);

  const byStatus = await Auction.aggregate([
    { $match: dateMatch },
    { $group: { _id: '$status', count: { $sum: 1 }, totalGmvPaise: { $sum: { $ifNull: ['$winningBidPaise', 0] } } } },
  ]);

  return { byStatus };
}

/**
 * SELLER — apni sales report — count, net earnings (commission ke baad)
 */
async function getSellerSalesReport(sellerId, { from, to }) {
  const dateMatch = {
    sellerId: new mongoose.Types.ObjectId(sellerId),
    ...buildDateRangeMatch('createdAt', from, to),
  };

  const result = await Order.aggregate([
    { $match: dateMatch },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        grossRevenuePaise: { $sum: '$totalAmountPaise' },
        commissionPaidPaise: { $sum: '$commissionPaise' },
        netEarningsPaise: { $sum: { $subtract: ['$totalAmountPaise', '$commissionPaise'] } },
      },
    },
  ]);

  return result[0] || { totalOrders: 0, grossRevenuePaise: 0, commissionPaidPaise: 0, netEarningsPaise: 0 };
}

/**
 * SELLER — apne auctions ka activity summary
 */
async function getSellerAuctionSummary(sellerId) {
  const byStatus = await Auction.aggregate([
    { $match: { sellerId: new mongoose.Types.ObjectId(sellerId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  return { byStatus };
}

module.exports = {
  getAdminSalesReport,
  getAdminAuctionSummary,
  getSellerSalesReport,
  getSellerAuctionSummary,
};
