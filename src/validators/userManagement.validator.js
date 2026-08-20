const { z } = require('zod');

const suspendUserSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required to suspend this user'),
});

module.exports = { suspendUserSchema };
