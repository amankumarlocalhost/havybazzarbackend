const SupportTicket = require('../models/supportTicket.model');
const AppError = require('../utils/AppError');
const { TICKET_STATUS } = require('../constants/enums');

async function createTicket(userId, { subject, description }) {
  return SupportTicket.create({ userId, subject, description });
}

async function getMyTickets(userId) {
  return SupportTicket.find({ userId }).sort({ createdAt: -1 });
}

async function getTicketById(ticketId, userId) {
  const query = { _id: ticketId };
  if (userId) query.userId = userId; // user apne hi tickets dekh sakta hai, admin sab
  const ticket = await SupportTicket.findOne(query);
  if (!ticket) throw new AppError('Ticket not found.', 404);
  return ticket;
}

async function replyAsUser(ticketId, userId, message) {
  const ticket = await getTicketById(ticketId, userId);
  ticket.replies.push({ message, isFromAdmin: false, authorId: userId });
  if (ticket.status === TICKET_STATUS.RESOLVED) {
    ticket.status = TICKET_STATUS.OPEN; // user ne dobara likha, reopen ho gaya
  }
  await ticket.save();
  return ticket;
}

// ---- Admin ----

async function adminListTickets({ status, page = 1, limit = 20 }) {
  const query = {};
  if (status) query.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    SupportTicket.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'fullName email'),
    SupportTicket.countDocuments(query),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function adminReply(ticketId, adminInfo, message) {
  const ticket = await getTicketById(ticketId);
  ticket.replies.push({ message, isFromAdmin: true, authorId: adminInfo.adminId });
  ticket.status = TICKET_STATUS.IN_PROGRESS;
  ticket.assignedToAdminId = adminInfo.adminId;
  await ticket.save();
  return ticket;
}

async function adminUpdateStatus(ticketId, status) {
  const ticket = await getTicketById(ticketId);
  ticket.status = status;
  await ticket.save();
  return ticket;
}

module.exports = {
  createTicket,
  getMyTickets,
  getTicketById,
  replyAsUser,
  adminListTickets,
  adminReply,
  adminUpdateStatus,
};
