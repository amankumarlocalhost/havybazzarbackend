const { z } = require('zod');

// Doc ke hisaab se ye teen types allowed hain
const DOC_TYPES = ['government_id', 'address_proof', 'business_registration'];

const submitKycSchema = z.object({
  businessName: z.string().trim().optional(),
  businessRegistrationNumber: z.string().trim().optional(),
  businessType: z.string().trim().optional(),
  // docType/docSubType har uploaded file ke liye multipart form-data me
  // alag se aayenge (multer files array ke saath) — isliye yahan sirf
  // optional business fields hain. File-specific validation controller me.
});

const reviewKycSchema = z.object({
  action: z.enum(['verify', 'reject']),
  reason: z.string().trim().optional(),
}).refine((data) => data.action !== 'reject' || (data.reason && data.reason.length > 0), {
  message: 'A reason is required when rejecting',
  path: ['reason'],
});

module.exports = { submitKycSchema, reviewKycSchema, DOC_TYPES };
