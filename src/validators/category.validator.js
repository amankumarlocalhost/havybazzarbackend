const { z } = require('zod');

const localizedNameSchema = z.object({
  en: z.string().trim().min(1, 'English name is required'),
  hi: z.string().trim().optional(),
  as: z.string().trim().optional(),
});

const createCategorySchema = z.object({
  name: localizedNameSchema,
  parentId: z.string().trim().nullable().optional(),
  description: z.string().trim().optional(),
  displayOrder: z.number().int().optional(),
});

const updateCategorySchema = z.object({
  name: localizedNameSchema.optional(),
  description: z.string().trim().optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

module.exports = { createCategorySchema, updateCategorySchema };
