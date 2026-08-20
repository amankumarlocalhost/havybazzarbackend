const mongoose = require('mongoose');
const { NOTIFICATION_TYPE } = require('../constants/enums');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPE), required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },

    // Frontend ko deep-link karne ke liye — e.g. { listingId, auctionId, orderId }
    metadata: { type: mongoose.Schema.Types.Mixed },

    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
