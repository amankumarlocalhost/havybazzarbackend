const { z } = require('zod');
const { TICKET_STATUS } = require('../constants/enums');

const createTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters'),
  description: z.string().trim().min(10, 'Please provide a more detailed description'),
});

const replySchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty'),
});

const updateStatusSchema = z.object({
  status: z.enum(Object.values(TICKET_STATUS)),
});

module.exports = { createTicketSchema, replySchema, updateStatusSchema };
