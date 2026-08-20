process.env.JWT_ACCESS_SECRET = 'test';
process.env.JWT_REFRESH_SECRET = 'test';
process.env.JWT_ADMIN_SECRET = 'test';
process.env.CLOUDINARY_CLOUD_NAME = 'test';
process.env.CLOUDINARY_API_KEY = 'test';
process.env.CLOUDINARY_API_SECRET = 'test';

describe('Module loading — koi require-time error nahi hona chahiye', () => {
  test('models load hote hain', () => {
    expect(() => require('../src/models/otp.model')).not.toThrow();
    expect(() => require('../src/models/kyc.model')).not.toThrow();
    expect(() => require('../src/models/admin.model')).not.toThrow();
    expect(() => require('../src/models/user.model')).not.toThrow();
    expect(() => require('../src/models/auditLog.model')).not.toThrow();
  });

  test('services load hote hain', () => {
    expect(() => require('../src/services/kyc.service')).not.toThrow();
    expect(() => require('../src/services/upload.service')).not.toThrow();
    expect(() => require('../src/services/auditLog.service')).not.toThrow();
    expect(() => require('../src/services/auth.service')).not.toThrow();
  });

  test('middlewares load hote hain', () => {
    expect(() => require('../src/middlewares/upload')).not.toThrow();
    expect(() => require('../src/middlewares/authenticateAdmin')).not.toThrow();
    expect(() => require('../src/middlewares/authenticate')).not.toThrow();
  });

  test('controllers aur routes load hote hain', () => {
    expect(() => require('../src/controllers/kyc.controller')).not.toThrow();
    expect(() => require('../src/routes/kyc.routes')).not.toThrow();
  });

  test('poora app.js (sab routes ke saath) load hota hai', () => {
    expect(() => require('../src/app')).not.toThrow();
  });

  test('PERMISSION enum me KYC ke zaroori keys hain', () => {
    const { PERMISSION } = require('../src/constants/enums');
    expect(PERMISSION.KYC_VIEW).toBe('kyc:view');
    expect(PERMISSION.KYC_VERIFY).toBe('kyc:verify');
  });

  test('Phase 4 (category + listing) sab modules load hote hain', () => {
    expect(() => require('../src/services/category.service')).not.toThrow();
    expect(() => require('../src/services/listing.service')).not.toThrow();
    expect(() => require('../src/controllers/category.controller')).not.toThrow();
    expect(() => require('../src/controllers/listing.controller')).not.toThrow();
    expect(() => require('../src/routes/category.routes')).not.toThrow();
    expect(() => require('../src/routes/listing.routes')).not.toThrow();
    expect(() => require('../src/utils/slugify')).not.toThrow();
  });

  test('Phase 5 (admin panel core) sab modules load hote hain', () => {
    expect(() => require('../src/models/cmsPage.model')).not.toThrow();
    expect(() => require('../src/services/adminAuth.service')).not.toThrow();
    expect(() => require('../src/services/subAdmin.service')).not.toThrow();
    expect(() => require('../src/services/userManagement.service')).not.toThrow();
    expect(() => require('../src/services/dashboard.service')).not.toThrow();
    expect(() => require('../src/services/cms.service')).not.toThrow();
    expect(() => require('../src/controllers/adminAuth.controller')).not.toThrow();
    expect(() => require('../src/controllers/subAdmin.controller')).not.toThrow();
    expect(() => require('../src/controllers/userManagement.controller')).not.toThrow();
    expect(() => require('../src/controllers/dashboard.controller')).not.toThrow();
    expect(() => require('../src/controllers/cms.controller')).not.toThrow();
    expect(() => require('../src/routes/admin.routes')).not.toThrow();
    expect(() => require('../src/routes/cms.routes')).not.toThrow();
  });

  test('poora app.js Phase 5 routes ke saath bhi load hota hai', () => {
    jest.resetModules();
    expect(() => require('../src/app')).not.toThrow();
  });

  test('Phase 6 (auction engine) sab modules load hote hain', () => {
    expect(() => require('../src/models/auction.model')).not.toThrow();
    expect(() => require('../src/models/bid.model')).not.toThrow();
    expect(() => require('../src/models/autoBid.model')).not.toThrow();
    expect(() => require('../src/models/auctionParticipant.model')).not.toThrow();
    expect(() => require('../src/utils/auctionMath')).not.toThrow();
    expect(() => require('../src/sockets')).not.toThrow();
    expect(() => require('../src/jobs/auctionQueue')).not.toThrow();
    expect(() => require('../src/controllers/auction.controller')).not.toThrow();
    expect(() => require('../src/routes/auction.routes')).not.toThrow();
    // auction.service aur auctionWorker Redis se lazy-connect karte hain,
    // isliye require karna safe hai bina Redis chalaye bhi
    expect(() => require('../src/services/auction.service')).not.toThrow();
    expect(() => require('../src/jobs/auctionWorker')).not.toThrow();
    expect(() => require('../src/jobs/auctionReconciliationCron')).not.toThrow();
  });

  test('poora app.js Phase 6 routes ke saath bhi load hota hai', () => {
    jest.resetModules();
    expect(() => require('../src/app')).not.toThrow();
  });

  test('Phase 7 (payments, wallet, orders) sab modules load hote hain', () => {
    expect(() => require('../src/models/walletTransaction.model')).not.toThrow();
    expect(() => require('../src/models/paymentOrder.model')).not.toThrow();
    expect(() => require('../src/models/order.model')).not.toThrow();
    expect(() => require('../src/models/withdrawal.model')).not.toThrow();
    expect(() => require('../src/services/wallet.service')).not.toThrow();
    expect(() => require('../src/services/razorpay.service')).not.toThrow();
    expect(() => require('../src/services/order.service')).not.toThrow();
    expect(() => require('../src/services/payment.service')).not.toThrow();
    expect(() => require('../src/services/withdrawal.service')).not.toThrow();
    expect(() => require('../src/controllers/payment.controller')).not.toThrow();
    expect(() => require('../src/controllers/withdrawal.controller')).not.toThrow();
    expect(() => require('../src/controllers/wallet.controller')).not.toThrow();
    expect(() => require('../src/controllers/order.controller')).not.toThrow();
    expect(() => require('../src/routes/payment.routes')).not.toThrow();
    expect(() => require('../src/routes/withdrawal.routes')).not.toThrow();
    expect(() => require('../src/routes/wallet.routes')).not.toThrow();
    expect(() => require('../src/routes/order.routes')).not.toThrow();
  });

  test('poora app.js Phase 7 routes ke saath bhi load hota hai', () => {
    jest.resetModules();
    expect(() => require('../src/app')).not.toThrow();
  });

  test('Phase 8 (notifications, wishlist, support, hardening) sab modules load hote hain', () => {
    expect(() => require('../src/models/notification.model')).not.toThrow();
    expect(() => require('../src/models/supportTicket.model')).not.toThrow();
    expect(() => require('../src/services/notification.service')).not.toThrow();
    expect(() => require('../src/services/whatsapp.service')).not.toThrow();
    expect(() => require('../src/services/email.service')).not.toThrow();
    expect(() => require('../src/services/supportTicket.service')).not.toThrow();
    expect(() => require('../src/controllers/notification.controller')).not.toThrow();
    expect(() => require('../src/controllers/supportTicket.controller')).not.toThrow();
    expect(() => require('../src/routes/notification.routes')).not.toThrow();
    expect(() => require('../src/routes/supportTicket.routes')).not.toThrow();
    expect(() => require('../src/services/report.service')).not.toThrow();
    expect(() => require('../src/controllers/report.controller')).not.toThrow();
    expect(() => require('../src/routes/report.routes')).not.toThrow();
  });

  test('poora app.js Phase 8 routes ke saath bhi load hota hai (final)', () => {
    jest.resetModules();
    expect(() => require('../src/app')).not.toThrow();
  });
});
