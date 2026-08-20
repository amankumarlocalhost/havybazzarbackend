/**
 * auth.validator.js
 * ---------------------------------------------------------------------------
 * Zod schemas — har API me user jo bhi data bhejega, controller tak
 * pahunchne se pehle yahan check hoga. Galat format aaya to yahi reject
 * ho jaayega, service layer tak pahunchega hi nahi.
 *
 * PAN aur GST ke exact regex isliye zaroori hain kyunki ye numbers baad me
 * invoice aur KYC me use honge — galat format ghusa to wahan problem banegi.
 * ---------------------------------------------------------------------------
 */

const { z } = require('zod');

// PAN format: 5 letters + 4 digits + 1 letter, e.g. ABCDE1234F
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

// GST format: 15 characters — 2 digit state code + PAN + 1 entity + Z + 1 checksum
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Indian phone: 10 digits, 6-9 se shuru
const PHONE_REGEX = /^[6-9]\d{9}$/;

const PINCODE_REGEX = /^\d{6}$/;

// -----------------------------------------------------------------------
// SIGNUP — email ya phone, dono me se koi ek zaroori hai
// -----------------------------------------------------------------------
const signupSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Invalid email format').optional(),
    phone: z.string().regex(PHONE_REGEX, 'Phone number must be 10 digits and start with 6-9').optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one capital letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    fullName: z.string().trim().min(2, 'Name is required'),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Either email or phone is required',
    path: ['email'],
  });

// -----------------------------------------------------------------------
// OTP VERIFY
// -----------------------------------------------------------------------
const verifyOtpSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(1, 'Email or phone is required'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  purpose: z.enum(['signup', 'login', 'forgot_password', 'phone_change']),
});

const resendOtpSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(1),
  purpose: z.enum(['signup', 'login', 'forgot_password', 'phone_change']),
});

// -----------------------------------------------------------------------
// LOGIN
// -----------------------------------------------------------------------
const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(1, 'Email or phone is required'),
  password: z.string().min(1, 'Password is required'),
});

// -----------------------------------------------------------------------
// FORGOT / RESET PASSWORD
// -----------------------------------------------------------------------
const forgotPasswordSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(1),
});

const resetPasswordSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(1),
  otp: z.string().length(6),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one capital letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

// -----------------------------------------------------------------------
// PROFILE SETUP (signup ke baad — doc ke hisaab se ye fields)
// -----------------------------------------------------------------------
const profileSetupSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  companyName: z.string().trim().optional(),
  gstNumber: z.string().trim().toUpperCase().regex(GST_REGEX, 'Invalid GST number format').optional(),
  panNumber: z.string().trim().toUpperCase().regex(PAN_REGEX, 'Invalid PAN number format').optional(),
  address: z
    .object({
      label: z.string().trim().optional(),
      line1: z.string().trim().min(1, 'Address line 1 is required'),
      line2: z.string().trim().optional(),
      city: z.string().trim().min(1, 'City is required'),
      state: z.string().trim().min(1, 'State is required'),
      country: z.string().trim().default('India'),
      pincode: z.string().regex(PINCODE_REGEX, 'Pincode must be 6 digits'),
    })
    .optional(),
});

module.exports = {
  signupSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  profileSetupSchema,
};
