const { z } = require('zod');

const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().trim().min(1),
  razorpayPaymentId: z.string().trim().min(1),
  razorpaySignature: z.string().trim().min(1),
});

/**
 * Purchase-type payments (fixed price ya auction final payment) ke liye —
 * doc ka "Legal Agreement Signing" rule. `z.literal(true)` ka matlab:
 * sirf `true` accept hoga, `false` ya missing field reject ho jaayegi.
 */
const acceptTermsSchema = z.object({
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the Terms & Conditions' }) }),
});

module.exports = { verifyPaymentSchema, acceptTermsSchema };
