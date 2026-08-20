const { z } = require('zod');

const placeBidSchema = z.object({
  amount: z.number().positive('Bid amount must be positive'),
});

const setAutoBidSchema = z.object({
  maxAmount: z.number().positive('Max amount must be positive'),
});

module.exports = { placeBidSchema, setAutoBidSchema };
