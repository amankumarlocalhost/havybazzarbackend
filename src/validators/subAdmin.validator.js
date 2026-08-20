const { z } = require('zod');
const { PERMISSION } = require('../constants/enums');

const permissionEnum = z.enum(Object.values(PERMISSION));

const createSubAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one capital letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  fullName: z.string().trim().min(2, 'Name is required'),
  phone: z.string().trim().optional(),
  permissions: z.array(permissionEnum).default([]),
});

const updatePermissionsSchema = z.object({
  permissions: z.array(permissionEnum),
});

const setActiveStatusSchema = z.object({
  isActive: z.boolean(),
});

module.exports = { createSubAdminSchema, updatePermissionsSchema, setActiveStatusSchema };
