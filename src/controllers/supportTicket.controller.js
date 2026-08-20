const ticketService = require('../services/supportTicket.service');
const catchAsync = require('../utils/catchAsync');

exports.create = catchAsync(async (req, res) => {
  const ticket = await ticketService.createTicket(req.user.userId, req.body);
  res.status(201).json({ success: true, message: 'Ticket created, we will reply soon', data: ticket });
});

exports.getMine = catchAsync(async (req, res) => {
  const tickets = await ticketService.getMyTickets(req.user.userId);
  res.status(200).json({ success: true, data: tickets });
});

exports.getOne = catchAsync(async (req, res) => {
  const ticket = await ticketService.getTicketById(req.params.ticketId, req.user.userId);
  res.status(200).json({ success: true, data: ticket });
});

exports.replyAsUser = catchAsync(async (req, res) => {
  const ticket = await ticketService.replyAsUser(req.params.ticketId, req.user.userId, req.body.message);
  res.status(200).json({ success: true, data: ticket });
});

// ---- Admin ----

exports.adminList = catchAsync(async (req, res) => {
  const { status, page, limit } = req.query;
  const result = await ticketService.adminListTickets({
    status,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  res.status(200).json({ success: true, data: result });
});

exports.adminGetOne = catchAsync(async (req, res) => {
  const ticket = await ticketService.getTicketById(req.params.ticketId);
  res.status(200).json({ success: true, data: ticket });
});

exports.adminReply = catchAsync(async (req, res) => {
  const ticket = await ticketService.adminReply(req.params.ticketId, req.admin, req.body.message);
  res.status(200).json({ success: true, data: ticket });
});

exports.adminUpdateStatus = catchAsync(async (req, res) => {
  const ticket = await ticketService.adminUpdateStatus(req.params.ticketId, req.body.status);
  res.status(200).json({ success: true, data: ticket });
});
