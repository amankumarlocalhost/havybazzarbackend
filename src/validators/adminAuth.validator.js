const { z } = require('zod');

const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

module.exports = { adminLoginSchema };
