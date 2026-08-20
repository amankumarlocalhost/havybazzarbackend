/**
 * notification.service.js
 * ---------------------------------------------------------------------------
 * Poore codebase me kahin bhi notification bhejni ho, sirf `notify()`
 * call karo — ye khud in-app (DB) + WhatsApp + email teeno handle karta
 * hai. Har jagah alag-alag notification code likhne ki zaroorat nahi
 * (jaisa maine bahut pehle chat me explain kiya tha).
 *
 * WhatsApp/email FAIL ho jaayein (provider abhi stub hai) to bhi in-app
 * notification (DB) hamesha ban jaani chahiye — isliye teeno independent
 * try/catch me hain, ek doosre ko block nahi karte.
 * ---------------------------------------------------------------------------
 */

const Notification = require('../models/notification.model');
const User = require('../models/user.model');
const { sendWhatsAppMessage } = require('./whatsapp.service');
const { sendEmail } = require('./email.service');
const { emitToAuction } = require('../sockets');

// Har notification type ka title/message template — ek hi jagah rakha
// taaki wording sab jagah consistent rahe
const TEMPLATES = {
  kyc_verified: () => ({ title: 'KYC Verified', message: 'Your KYC has been verified. You can now become a seller.' }),
  kyc_rejected: (data) => ({ title: 'KYC Rejected', message: `Your KYC was rejected: ${data.reason || 'please recheck your documents'}` }),
  listing_approved: (data) => ({ title: 'Listing Approved', message: `Your listing "${data.title}" is now live.` }),
  listing_rejected: (data) => ({ title: 'Listing Rejected', message: `Your listing "${data.title}" was rejected: ${data.reason || ''}` }),
  bid_outbid: (data) => ({ title: 'You Have Been Outbid', message: `Someone outbid you on "${data.title}". New highest bid: Rs ${(data.amountPaise / 100).toLocaleString('en-IN')}` }),
  auction_won: (data) => ({ title: 'Auction Won!', message: `Congratulations! You won "${data.title}". Please complete your payment.` }),
  auction_lost: (data) => ({ title: 'Auction Ended', message: `The auction for "${data.title}" has ended and you did not win this time. Your EMD has been refunded as HB Coins.` }),
  auction_ending_soon: (data) => ({ title: 'Auction Ending Soon', message: `"${data.title}" will end in 5 minutes.` }),
  order_status_changed: (data) => ({ title: 'Order Update', message: `Order #${data.orderNumber} is now "${data.status}".` }),
  withdrawal_approved: (data) => ({ title: 'Withdrawal Approved', message: `Your withdrawal of Rs ${(data.amountPaise / 100).toLocaleString('en-IN')} has been approved.` }),
  withdrawal_rejected: (data) => ({ title: 'Withdrawal Rejected', message: `Your withdrawal was rejected: ${data.reason || ''}. Your coins have been refunded.` }),
};

async function notify(userId, type, data = {}) {
  const template = TEMPLATES[type];
  if (!template) {
    console.error(`Unknown notification type: ${type}`);
    return;
  }

  const { title, message } = template(data);

  // 1. IN-APP — hamesha banti hai, ye sabse zaroori channel hai
  try {
    await Notification.create({ userId, type, title, message, metadata: data });
  } catch (err) {
    console.error('In-app notification create karne me error:', err.message);
  }

  // 2. WhatsApp — best-effort, fail ho to bhi aage badho
  try {
    const user = await User.findById(userId).select('phone');
    if (user?.phone) {
      await sendWhatsAppMessage(user.phone, type, data);
    }
  } catch (err) {
    console.error('WhatsApp notification fail hui:', err.message);
  }

  // 3. Email — best-effort
  try {
    const user = await User.findById(userId).select('email');
    if (user?.email) {
      await sendEmail(user.email, title, message);
    }
  } catch (err) {
    console.error('Email notification fail hui:', err.message);
  }
}

async function getMyNotifications(userId, { page = 1, limit = 20, unreadOnly = false }) {
  const query = { userId };
  if (unreadOnly) query.isRead = false;

  const skip = (page - 1) * limit;
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(query),
    Notification.countDocuments({ userId, isRead: false }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit), unreadCount };
}

async function markAsRead(notificationId, userId) {
  await Notification.updateOne({ _id: notificationId, userId }, { isRead: true });
}

async function markAllAsRead(userId) {
  await Notification.updateMany({ userId, isRead: false }, { isRead: true });
}

module.exports = { notify, getMyNotifications, markAsRead, markAllAsRead };
