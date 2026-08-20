process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';

const { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } = require('../src/utils/jwt');
const { generateOtp, hashOtp } = require('../src/utils/otpHelper');
const { hashPassword, comparePassword } = require('../src/utils/password');
const {
  signupSchema,
  verifyOtpSchema,
  profileSetupSchema,
} = require('../src/validators/auth.validator');

describe('JWT utils', () => {
  test('access token sign/verify roundtrip', () => {
    const token = signAccessToken({ userId: 'abc123', activeRole: 'buyer' });
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe('abc123');
    expect(decoded.activeRole).toBe('buyer');
  });

  test('galat secret se verify fail hona chahiye', () => {
    const token = signRefreshToken({ userId: 'abc123' });
    expect(() => verifyAccessToken(token)).toThrow(); // refresh token access secret se verify nahi hoga
  });
});

describe('OTP helper', () => {
  test('OTP hamesha 6 digit ka hona chahiye', () => {
    for (let i = 0; i < 50; i++) {
      const otp = generateOtp();
      expect(otp).toHaveLength(6);
      expect(/^\d{6}$/.test(otp)).toBe(true);
    }
  });

  test('same OTP ka hash hamesha same hona chahiye (deterministic)', () => {
    expect(hashOtp('123456')).toBe(hashOtp('123456'));
    expect(hashOtp('123456')).not.toBe(hashOtp('654321'));
  });
});

describe('Password hashing', () => {
  test('hash se compare match hona chahiye', async () => {
    const hash = await hashPassword('MyPassword123');
    expect(await comparePassword('MyPassword123', hash)).toBe(true);
    expect(await comparePassword('WrongPassword', hash)).toBe(false);
  });

  test('plain password kabhi hash jaisa nahi dikhna chahiye', async () => {
    const hash = await hashPassword('MyPassword123');
    expect(hash).not.toBe('MyPassword123');
    expect(hash.startsWith('$2')).toBe(true); // bcrypt hash format
  });
});

describe('Zod validators', () => {
  test('signup: email ya phone dono na hone pe reject', () => {
    const result = signupSchema.safeParse({ password: 'Test1234', fullName: 'Test User' });
    expect(result.success).toBe(false);
  });

  test('signup: weak password reject hona chahiye', () => {
    const result = signupSchema.safeParse({
      email: 'a@b.com',
      password: 'weak',
      fullName: 'Test',
    });
    expect(result.success).toBe(false);
  });

  test('signup: valid data accept hona chahiye', () => {
    const result = signupSchema.safeParse({
      email: 'ramesh@test.com',
      password: 'Test1234',
      fullName: 'Ramesh Kumar',
    });
    expect(result.success).toBe(true);
  });

  test('OTP: 6 se kam/zyada digit reject', () => {
    expect(verifyOtpSchema.safeParse({ identifier: 'a@b.com', otp: '123', purpose: 'signup' }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ identifier: 'a@b.com', otp: '123456', purpose: 'signup' }).success).toBe(true);
  });

  test('Profile: galat PAN format reject hona chahiye', () => {
    const result = profileSetupSchema.safeParse({ panNumber: 'INVALID123' });
    expect(result.success).toBe(false);
  });

  test('Profile: sahi PAN format accept hona chahiye', () => {
    const result = profileSetupSchema.safeParse({ panNumber: 'abcde1234f' }); // lowercase bhi chalna chahiye (uppercase transform)
    expect(result.success).toBe(true);
    expect(result.data.panNumber).toBe('ABCDE1234F');
  });

  test('Profile: galat GST format reject hona chahiye', () => {
    const result = profileSetupSchema.safeParse({ gstNumber: 'WRONGGST' });
    expect(result.success).toBe(false);
  });

  test('Profile: galat pincode reject hona chahiye', () => {
    const result = profileSetupSchema.safeParse({
      address: { line1: 'Test St', city: 'Delhi', state: 'Delhi', pincode: '123' },
    });
    expect(result.success).toBe(false);
  });
});

describe('KYC validator', () => {
  const { reviewKycSchema } = require('../src/validators/kyc.validator');

  test('reject action ke saath reason zaroori hai', () => {
    const result = reviewKycSchema.safeParse({ action: 'reject' });
    expect(result.success).toBe(false);
  });

  test('reject + reason ke saath valid hona chahiye', () => {
    const result = reviewKycSchema.safeParse({ action: 'reject', reason: 'Blurred document' });
    expect(result.success).toBe(true);
  });

  test('verify action ke liye reason optional hai', () => {
    const result = reviewKycSchema.safeParse({ action: 'verify' });
    expect(result.success).toBe(true);
  });

  test('galat action value reject honi chahiye', () => {
    const result = reviewKycSchema.safeParse({ action: 'approve' });
    expect(result.success).toBe(false);
  });
});
