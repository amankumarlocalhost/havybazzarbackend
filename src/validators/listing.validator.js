const { z } = require('zod');
const { BUSINESS_RULES } = require('../constants/enums');

const specGeneralSchema = z.object({
  referenceNumber: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  type: z.string().trim().optional(),
  typeExtended: z.string().trim().optional(),

  // Doc rule: 5 saal se purana equipment allowed nahi.
  // Current year DYNAMICALLY nikala jaata hai — schema me hardcode nahi
  // kar sakte kyunki "5 saal purana" har din badalta hai.
  productionYear: z
    .number()
    .int()
    .refine((year) => year >= new Date().getFullYear() - BUSINESS_RULES.MAX_EQUIPMENT_AGE_YEARS, {
      message: `Equipment cannot be older than ${BUSINESS_RULES.MAX_EQUIPMENT_AGE_YEARS} years`,
    })
    .refine((year) => year <= new Date().getFullYear(), {
      message: 'Production year cannot be in the future',
    })
    .optional(),

  hoursOnMeter: z
    .number()
    .min(0)
    .max(BUSINESS_RULES.MAX_HOUR_METER, `Hour meter cannot exceed ${BUSINESS_RULES.MAX_HOUR_METER}`)
    .optional(),

  totalWeightKg: z.number().positive().optional(),
  serialNumber: z.string().trim().optional(),
}).optional();

const specEngineSchema = z.object({
  brand: z.string().trim().optional(),
  type: z.string().trim().optional(),
  cylinderCount: z.number().int().positive().optional(),
}).optional();

const specHydraulicSchema = z.object({
  systemType: z.string().trim().optional(),
  quickCouplerBrand: z.string().trim().optional(),
  quickCouplerType: z.string().trim().optional(),
}).optional();

const specCabinSchema = z.object({
  hasAirSuspensionSeat: z.boolean().optional(),
  hasAirConditioning: z.boolean().optional(),
}).optional();

const specUndercarriageSchema = z.object({
  shoesWidthMm: z.number().positive().optional(),
  tracksWidthMm: z.number().positive().optional(),
}).optional();

// Seller flow aur admin direct-create flow, dono ka basic shape same hai —
// admin schema neeche isi me sirf `sellerId` jodta hai.
const listingBaseShape = {
  title: z.string().trim().min(3, 'Title must be at least 3 characters'),
  description: z.string().trim().optional(),
  categoryId: z.string().trim().min(1, 'Category is required'),
  condition: z.enum(['excellent', 'good', 'fair']).optional(),

  location: z.object({
    state: z.string().trim().min(1, 'State is required'),
    city: z.string().trim().optional(),
    country: z.string().trim().default('India'),
  }),

  vehicleRegistrationNumber: z.string().trim().optional(),

  specifications: z.object({
    general: specGeneralSchema,
    engine: specEngineSchema,
    hydraulic: specHydraulicSchema,
    cabin: specCabinSchema,
    undercarriage: specUndercarriageSchema,
  }).optional(),

  listingType: z.enum(['fixed_price', 'auction']),

  // Fixed price mode me zaroori — AMOUNT RUPAYE me aayega frontend se,
  // service layer paise me convert karega
  fixedPrice: z.number().positive().optional(),

  // Sirf fixed_price ke liye — seller ke paas kitni units hain (default 1).
  // Auction hamesha single-item hota hai, isliye wahan ignore hota hai.
  quantity: z.number().int().positive().optional(),

  // Auction mode ke fields — Phase 6 (auction engine) inhe poori tarah use karega
  auctionConfig: z.object({
    startingBid: z.number().positive(),
    minBidIncrement: z.number().positive(),
    reservePrice: z.number().positive().optional(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
  }).optional(),
};

function withListingRefinements(schema) {
  return schema.refine(
    (data) => data.listingType !== 'fixed_price' || data.fixedPrice,
    { message: 'Price is required for a fixed price listing', path: ['fixedPrice'] }
  ).refine(
    (data) => data.listingType !== 'auction' || data.auctionConfig,
    { message: 'Auction config is required for an auction listing', path: ['auctionConfig'] }
  );
}

const createListingSchema = withListingRefinements(z.object(listingBaseShape));

// ADMIN — seller ki taraf se seedha listing banata hai, isliye sellerId
// zaroori hai (kaun sa seller iska "owner" hai)
const adminCreateListingSchema = withListingRefinements(
  z.object({
    ...listingBaseShape,
    sellerId: z.string().trim().min(1, 'Seller is required'),
  })
);

const updateListingSchema = z.object({
  title: z.string().trim().min(3).optional(),
  description: z.string().trim().optional(),
  condition: z.enum(['excellent', 'good', 'fair']).optional(),
  fixedPrice: z.number().positive().optional(),
  quantity: z.number().int().positive().optional(),
  specifications: z.object({
    general: specGeneralSchema,
    engine: specEngineSchema,
    hydraulic: specHydraulicSchema,
    cabin: specCabinSchema,
    undercarriage: specUndercarriageSchema,
  }).optional(),
});

const reviewListingSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().trim().optional(),
}).refine((data) => data.action !== 'reject' || (data.reason && data.reason.length > 0), {
  message: 'A reason is required when rejecting',
  path: ['reason'],
});

module.exports = { createListingSchema, adminCreateListingSchema, updateListingSchema, reviewListingSchema };
