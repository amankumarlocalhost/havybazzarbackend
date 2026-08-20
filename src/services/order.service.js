/**
 * order.service.js
 * ---------------------------------------------------------------------------
 * Commission calculation ka DESIGN DECISION (jo enums.js me bhi likha hai):
 * buyer poora DISPLAYED price deta hai — koi extra addition nahi. Commission
 * (1% buyer-side + 1% seller-side = 2% total) usi total se kaata jaata hai,
 * seller ko baaki milta hai. Ye exactly wahi hisaab hai jo maine chat me
 * pehle explain kiya tha.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const Order = require('../models/order.model');
const Listing = require('../models/listing.model');
const AppError = require('../utils/AppError');
const walletService = require('./wallet.service');
const categoryService = require('./category.service');
const { logAdminAction } = require('./auditLog.service');
const { calculateEmdAmountPaise } = require('../utils/auctionMath');
const { LISTING_STATUS, ORDER_STATUS, BUSINESS_RULES, AUDIT_ACTION } = require('../constants/enums');

async function generateOrderNumber() {
  const year = new Date().getFullYear();
  let orderNumber;
  let exists = true;

  // eslint-disable-next-line no-await-in-loop
  while (exists) {
    const randomPart = Math.floor(100000 + Math.random() * 900000); // 6-digit random
    orderNumber = `HB-${year}-${randomPart}`;
    // eslint-disable-next-line no-await-in-loop
    exists = await Order.exists({ orderNumber });
  }

  return orderNumber;
}

async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  let invoiceNumber;
  let exists = true;

  // eslint-disable-next-line no-await-in-loop
  while (exists) {
    const randomPart = Math.floor(100000 + Math.random() * 900000);
    invoiceNumber = `INV-${year}-${randomPart}`;
    // eslint-disable-next-line no-await-in-loop
    exists = await Order.exists({ invoiceNumber });
  }

  return invoiceNumber;
}

function calculateCommissionSplit(totalAmountPaise) {
  const commissionPaise = calculateEmdAmountPaise(
    totalAmountPaise,
    BUSINESS_RULES.COMMISSION_BPS_BUYER + BUSINESS_RULES.COMMISSION_BPS_SELLER
  );
  const sellerReceivesPaise = totalAmountPaise - commissionPaise;
  return { commissionPaise, sellerReceivesPaise };
}

/**
 * FIXED PRICE purchase — payment verify hone ke BAAD payment.service.js
 * isko call karega.
 */
async function createOrderFromFixedPricePurchase(listingId, buyerId, shippingAddress, termsAcceptedAt) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // Atomic decrement — agar do buyers ek hi waqt pe aakhri unit khareed
    // rahe hon, sirf ek ko hi milegi (quantityAvailable > 0 filter ke
    // saath). `findOneAndUpdate` ke andar hi condition + decrement ek
    // hi operation hai, isliye race-safe hai (session ke bahar bhi).
    const listing = await Listing.findOneAndUpdate(
      { _id: listingId, status: LISTING_STATUS.ACTIVE, quantityAvailable: { $gt: 0 } },
      { $inc: { quantityAvailable: -1 } },
      { new: false, session } // purani value chahiye taaki fixedPricePaise/sellerId pata chale
    );
    if (!listing) throw new AppError('This listing is no longer available.', 400);

    const remainingAfterThis = listing.quantityAvailable - 1;

    const totalAmountPaise = listing.fixedPricePaise;
    const { commissionPaise, sellerReceivesPaise } = calculateCommissionSplit(totalAmountPaise);

    const orderNumber = await generateOrderNumber();

    const [order] = await Order.create(
      [
        {
          orderNumber,
          buyerId,
          sellerId: listing.sellerId,
          listingId: listing._id,
          orderType: 'fixed_price',
          totalAmountPaise,
          commissionPaise,
          status: ORDER_STATUS.PROCESSING,
          shippingAddress,
          termsAcceptedAt,
        },
      ],
      { session }
    );

    // Last unit bik gayi to hi listing SOLD hoti hai aur website se hatti
    // hai — jab tak stock bacha hai, listing ACTIVE hi rehti hai (sirf
    // updated quantityAvailable ke saath).
    const soldOut = remainingAfterThis <= 0;
    if (soldOut) {
      await Listing.updateOne({ _id: listingId }, { status: LISTING_STATUS.SOLD }, { session });
    }

    await walletService.creditSaleProceeds(listing.sellerId, sellerReceivesPaise, order._id, session);

    await session.commitTransaction();
    session.endSession();

    if (soldOut) {
      await categoryService.syncListingCount(listing.categoryId, -1);
    }

    return order;
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    throw err;
  }
}

/**
 * AUCTION WIN — final payment verify hone ke BAAD payment.service.js
 * isko call karega. Listing already SOLD hai (auction.service.js ka
 * closeAuction() ne kar diya tha winner decide hote hi).
 */
async function createOrderFromAuctionWin(auction, shippingAddress, termsAcceptedAt) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const totalAmountPaise = auction.winningBidPaise;
    const { commissionPaise, sellerReceivesPaise } = calculateCommissionSplit(totalAmountPaise);

    const orderNumber = await generateOrderNumber();

    const [order] = await Order.create(
      [
        {
          orderNumber,
          buyerId: auction.winnerId,
          sellerId: auction.sellerId,
          listingId: auction.listingId,
          orderType: 'auction_win',
          totalAmountPaise,
          emdAdjustedPaise: auction.emdAmountPaise,
          commissionPaise,
          status: ORDER_STATUS.PROCESSING,
          shippingAddress,
          termsAcceptedAt,
        },
      ],
      { session }
    );

    await walletService.creditSaleProceeds(auction.sellerId, sellerReceivesPaise, order._id, session);

    await session.commitTransaction();
    session.endSession();

    return order;
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    throw err;
  }
}

async function generateInvoice(orderId, userId) {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found.', 404);
  if (order.buyerId.toString() !== userId.toString() && order.sellerId.toString() !== userId.toString()) {
    throw new AppError('You do not have access to this order.', 403);
  }

  if (order.invoiceNumber) {
    return order; // already generated — idempotent
  }

  order.invoiceNumber = await generateInvoiceNumber();
  order.invoiceGeneratedAt = new Date();
  await order.save();

  return order;
}

/**
 * Invoice PDF ke liye poori detail chahiye — listing (specs ke saath),
 * buyer, seller. Agar invoice number abhi tak nahi bana to yahin bana
 * dete hain (idempotent, jaisa generateInvoice() karta hai).
 */
async function getOrderForInvoice(orderId, userId) {
  const order = await Order.findById(orderId)
    .populate('listingId')
    .populate('buyerId', 'fullName email phone')
    .populate('sellerId', 'fullName email phone');

  if (!order) throw new AppError('Order not found.', 404);
  if (order.buyerId._id.toString() !== userId.toString() && order.sellerId._id.toString() !== userId.toString()) {
    throw new AppError('You do not have access to this order.', 403);
  }

  if (!order.invoiceNumber) {
    order.invoiceNumber = await generateInvoiceNumber();
    order.invoiceGeneratedAt = new Date();
    await order.save();
  }

  return order;
}

async function getMyOrders(buyerId, { page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Order.find({ buyerId }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('listingId', 'title media'),
    Order.countDocuments({ buyerId }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function getSellerOrders(sellerId, { page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Order.find({ sellerId }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('listingId', 'title media'),
    Order.countDocuments({ sellerId }),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function adminListOrders({ status, page = 1, limit = 20 }) {
  const query = {};
  if (status && status !== 'all') query.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('listingId', 'title media')
      .populate('buyerId', 'fullName email phone')
      .populate('sellerId', 'fullName email phone'),
    Order.countDocuments(query),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function updateOrderStatus(orderId, status, adminInfo) {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found.', 404);

  const beforeStatus = order.status;
  order.status = status;
  await order.save();

  await logAdminAction({
    adminId: adminInfo.adminId,
    adminName: adminInfo.fullName,
    adminEmail: adminInfo.email,
    action: AUDIT_ACTION.ORDER_STATUS_UPDATED,
    targetType: 'Order',
    targetId: order._id,
    targetLabel: order.orderNumber,
    changesBefore: { status: beforeStatus },
    changesAfter: { status },
  });

  const notificationService = require('./notification.service');
  await notificationService.notify(order.buyerId, 'order_status_changed', {
    orderNumber: order.orderNumber,
    status,
  });

  return order;
}

module.exports = {
  generateOrderNumber,
  generateInvoiceNumber,
  calculateCommissionSplit,
  createOrderFromFixedPricePurchase,
  createOrderFromAuctionWin,
  generateInvoice,
  getOrderForInvoice,
  getMyOrders,
  getSellerOrders,
  adminListOrders,
  updateOrderStatus,
};
