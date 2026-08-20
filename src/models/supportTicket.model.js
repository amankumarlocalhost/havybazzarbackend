const mongoose = require('mongoose');
const { TICKET_STATUS } = require('../constants/enums');

const replySchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true },
    isFromAdmin: { type: Boolean, required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, required: true }, // User ya AdminUser
  },
  { timestamps: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },

    status: {
      type: String,
      enum: Object.values(TICKET_STATUS),
      default: TICKET_STATUS.OPEN,
      index: true,
    },

    replies: { type: [replySchema], default: [] },
    assignedToAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
