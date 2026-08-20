const { z } = require('zod');

const localizedTextSchema = z.object({
  en: z.string().trim().optional(),
  hi: z.string().trim().optional(),
  as: z.string().trim().optional(),
});

const upsertCmsPageSchema = z.object({
  title: localizedTextSchema,
  content: localizedTextSchema,
  isPublished: z.boolean().optional(),
});

module.exports = { upsertCmsPageSchema };
