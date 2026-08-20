const { z } = require('zod');

const requestWithdrawalSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  bankAccountNumber: z.string().trim().min(5, 'Invalid bank account number'),
  bankIfsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format'),
});

const rejectWithdrawalSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required to reject this withdrawal'),
});

module.exports = { requestWithdrawalSchema, rejectWithdrawalSchema };
