const { verifyPaymentSchema } = require('../src/validators/payment.validator');
const { requestWithdrawalSchema, rejectWithdrawalSchema } = require('../src/validators/withdrawal.validator');
const { updateOrderStatusSchema } = require('../src/validators/order.validator');

// order.service.js ke top-level me razorpay/mongoose models import hote
// hain, par calculateCommissionSplit khud pure function hai (koi DB call
// nahi) — isliye seedha require karke test kar sakte hain
process.env.RAZORPAY_KEY_ID = 'test_key';
process.env.RAZORPAY_SECRET = 'test_secret';
const { calculateCommissionSplit } = require('../src/services/order.service');

describe('calculateCommissionSplit — commission math', () => {
  test('2% total commission (1% buyer + 1% seller) sahi calculate hoti hai', () => {
    const result = calculateCommissionSplit(120000000); // ₹12,00,000
    expect(result.commissionPaise).toBe(2400000); // ₹24,000 (jaisa chat me example diya tha)
    expect(result.sellerReceivesPaise).toBe(117600000); // ₹11,76,000
  });

  test('commission + sellerReceives = total amount (paisa kahin gum nahi hota)', () => {
    const total = 87654321;
    const result = calculateCommissionSplit(total);
    expect(result.commissionPaise + result.sellerReceivesPaise).toBe(total);
  });

  test('chhote amount pe bhi rounding sahi rehti hai', () => {
    const result = calculateCommissionSplit(101); // 1 rupaya 1 paisa
    expect(Number.isInteger(result.commissionPaise)).toBe(true);
    expect(Number.isInteger(result.sellerReceivesPaise)).toBe(true);
  });
});

describe('Payment verify validator', () => {
  test('teeno fields zaroori hain', () => {
    expect(
      verifyPaymentSchema.safeParse({ razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1' }).success
    ).toBe(false);
  });

  test('sab fields ke saath valid', () => {
    expect(
      verifyPaymentSchema.safeParse({
        razorpayOrderId: 'order_1',
        razorpayPaymentId: 'pay_1',
        razorpaySignature: 'sig_abc',
      }).success
    ).toBe(true);
  });
});

describe('Withdrawal validators', () => {
  test('galat IFSC format reject', () => {
    const result = requestWithdrawalSchema.safeParse({
      amount: 500,
      bankAccountNumber: '123456789',
      bankIfsc: 'INVALID',
    });
    expect(result.success).toBe(false);
  });

  test('sahi IFSC format accept, lowercase ko uppercase me convert kare', () => {
    const result = requestWithdrawalSchema.safeParse({
      amount: 500,
      bankAccountNumber: '123456789012',
      bankIfsc: 'hdfc0001234',
    });
    expect(result.success).toBe(true);
    expect(result.data.bankIfsc).toBe('HDFC0001234');
  });

  test('reject reason ke bina fail', () => {
    expect(rejectWithdrawalSchema.safeParse({}).success).toBe(false);
  });
});

describe('Order status validator', () => {
  test('valid status accept', () => {
    expect(updateOrderStatusSchema.safeParse({ status: 'shipped' }).success).toBe(true);
  });

  test('invalid status reject', () => {
    expect(updateOrderStatusSchema.safeParse({ status: 'teleported' }).success).toBe(false);
  });
});
