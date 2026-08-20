/**
 * enums.js
 * ---------------------------------------------------------------------------
 * Saare status strings yahan ek jagah define honge.
 *
 * Kyun? Agar aap poore codebase me "under_review" string haath se likhenge,
 * to ek din kahin "under-review" ya "underReview" likh denge aur bug pakadna
 * mushkil ho jaayega. Yahan se import karenge to typo pe turant error aayega.
 * ---------------------------------------------------------------------------
 */

// User ke roles. Ek hi user ke paas dono ho sakte hain (role switcher).
const USER_ROLE = {
  BUYER: 'buyer',
  SELLER: 'seller',
};

// User account ki halat
const USER_STATUS = {
  UNVERIFIED: 'unverified',   // signup ho gaya, OTP pending
  ACTIVE: 'active',           // OTP verified, normal user
  SUSPENDED: 'suspended',     // admin ne block kiya
};

// KYC ki state machine
const KYC_STATUS = {
  NOT_STARTED: 'not_started', // user ne abhi documents daale hi nahi
  PENDING: 'pending',         // documents upload ho gaye, submit nahi kiye
  SUBMITTED: 'submitted',     // third-party API ko bhej diya, jawab ka intezaar
  VERIFIED: 'verified',       // pass — ab ye user bid aur list kar sakta hai
  REJECTED: 'rejected',       // fail — reason ke saath
};

/**
 * Listing ki state machine. Ye order important hai:
 *
 *   draft -> pending_payment (sirf auction me) -> under_review
 *         -> approved -> active -> sold / expired / removed
 *                     -> rejected
 *
 * Har transition backend me validate hoga. Koi listing seedha
 * draft se active nahi ja sakti.
 */
const LISTING_STATUS = {
  DRAFT: 'draft',                     // seller likh raha hai, submit nahi kiya
  PENDING_PAYMENT: 'pending_payment', // auction hai, seller ka EMD pending
  UNDER_REVIEW: 'under_review',       // admin ke paas approval ke liye
  APPROVED: 'approved',               // admin ne haan kaha, abhi live nahi
  ACTIVE: 'active',                   // website pe dikh raha hai
  REJECTED: 'rejected',               // admin ne mana kiya (reason ke saath)
  SOLD: 'sold',                       // bik gaya
  EXPIRED: 'expired',                 // auction bina bid ke khatam
  REMOVED: 'removed',                 // seller ya admin ne hataya (soft delete)
};

// Listing kis mode me bik rahi hai
const LISTING_TYPE = {
  FIXED_PRICE: 'fixed_price',
  AUCTION: 'auction',
};

// Equipment ki halat (filter me kaam aayega)
const EQUIPMENT_CONDITION = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  FAIR: 'fair',
};

// Media types jo listing me upload honge
const MEDIA_TYPE = {
  IMAGE: 'image',
  VIDEO: 'video',
  DOCUMENT: 'document', // inspection report PDF wagairah
};

// Admin panel ke roles
const ADMIN_ROLE = {
  SUPER_ADMIN: 'super_admin', // sab kuch kar sakta hai
  SUB_ADMIN: 'sub_admin',     // sirf assigned permissions
};

/**
 * Permission strings — format hai "resource:action".
 *
 * Super Admin ko ye check karne ki zaroorat nahi (usko sab milta hai).
 * Sub Admin ke document me inhi me se kuch strings ka array hoga.
 */
const PERMISSION = {
  LISTINGS_VIEW: 'listings:view',
  LISTINGS_APPROVE: 'listings:approve',
  LISTINGS_EDIT: 'listings:edit',
  LISTINGS_DELETE: 'listings:delete',

  USERS_VIEW: 'users:view',
  USERS_EDIT: 'users:edit',
  USERS_SUSPEND: 'users:suspend',
  USERS_EXPORT: 'users:export',

  KYC_VIEW: 'kyc:view',
  KYC_VERIFY: 'kyc:verify',

  CATEGORIES_MANAGE: 'categories:manage',

  ORDERS_VIEW: 'orders:view',
  ORDERS_MANAGE: 'orders:manage',

  TRANSACTIONS_VIEW: 'transactions:view',
  WITHDRAWALS_APPROVE: 'withdrawals:approve',

  TICKETS_VIEW: 'tickets:view',
  TICKETS_MANAGE: 'tickets:manage',

  CMS_MANAGE: 'cms:manage',
  SUPPORT_MANAGE: 'support:manage',
  REPORTS_VIEW: 'reports:view',
  SUBADMIN_MANAGE: 'subadmin:manage',
};

// OTP kis kaam ke liye bheja gaya
const OTP_PURPOSE = {
  SIGNUP: 'signup',
  LOGIN: 'login',
  FORGOT_PASSWORD: 'forgot_password',
  PHONE_CHANGE: 'phone_change',
};

/**
 * Audit log me kya action hua. Ye list badhti rahegi jaise-jaise
 * naye admin actions add honge.
 */
const AUDIT_ACTION = {
  LISTING_APPROVED: 'listing.approved',
  LISTING_REJECTED: 'listing.rejected',
  LISTING_REMOVED: 'listing.removed',
  LISTING_CREATED_BY_ADMIN: 'listing.created_by_admin',
  USER_SUSPENDED: 'user.suspended',
  USER_ACTIVATED: 'user.activated',
  USER_ROLE_UPDATED: 'user.role_updated',
  KYC_VERIFIED: 'kyc.verified',
  KYC_REJECTED: 'kyc.rejected',
  CATEGORY_CREATED: 'category.created',
  CATEGORY_UPDATED: 'category.updated',
  CATEGORY_DELETED: 'category.deleted',
  SUBADMIN_CREATED: 'subadmin.created',
  SUBADMIN_UPDATED: 'subadmin.updated',
  WITHDRAWAL_APPROVED: 'withdrawal.approved',
  WITHDRAWAL_REJECTED: 'withdrawal.rejected',
  CMS_PAGE_UPDATED: 'cms_page.updated',
  ORDER_STATUS_UPDATED: 'order.status_updated',
};

// Auction ki state machine
const AUCTION_STATUS = {
  SCHEDULED: 'scheduled', // bana hai, abhi start nahi hua
  LIVE: 'live',           // bidding chal rahi hai
  CLOSED: 'closed',       // khatam, winner decide ho chuka (ya no-bid se cancel)
  CANCELLED: 'cancelled', // reserve price nahi mila, ya listing hi reject ho gayi
};

// EMD ki state machine (buyer aur seller dono ke liye, per-auction)
const EMD_STATUS = {
  HELD: 'held',
  RELEASED: 'released',     // haar gaya, wapas mil gaya
  ADJUSTED: 'adjusted',     // jeet gaya, final price me adjust hua
  FORFEITED: 'forfeited',   // bhaag gaya, zabt ho gaya
};
const LANGUAGE = {
  ENGLISH: 'en',
  HINDI: 'hi',
  ASSAMESE: 'as',
};

// Wallet ledger — har entry ka type. Append-only ledger, kabhi update nahi
const WALLET_TXN_TYPE = {
  EMD_HELD: 'emd_held',
  EMD_RELEASED: 'emd_released',         // haara — coins ban gaye
  EMD_ADJUSTED: 'emd_adjusted',         // jeeta — final price me adjust
  EMD_FORFEITED: 'emd_forfeited',       // bhaaga — zabt
  COIN_CREDIT: 'coin_credit',
  COIN_DEBIT: 'coin_debit',             // agle EMD me use kiya, ya withdraw
  SALE_CREDIT: 'sale_credit',           // seller ko order complete hone pe
  COMMISSION_DEBIT: 'commission_debit', // admin ka 1% commission
};

// Razorpay order kis liye bana
const PAYMENT_PURPOSE = {
  BUYER_EMD: 'buyer_emd',
  SELLER_EMD: 'seller_emd',
  FIXED_PRICE_PURCHASE: 'fixed_price_purchase',
  AUCTION_FINAL_PAYMENT: 'auction_final_payment',
};

const PAYMENT_STATUS = {
  CREATED: 'created', // Razorpay order bana, payment abhi hui nahi
  PAID: 'paid',
  FAILED: 'failed',
};

// Doc ka rule: Processing, Shipped, Delivered, Cancelled, Refunded
const ORDER_STATUS = {
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
};

const WITHDRAWAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

// In-app notifications — event-driven, doc ka rule
const NOTIFICATION_TYPE = {
  KYC_VERIFIED: 'kyc_verified',
  KYC_REJECTED: 'kyc_rejected',
  LISTING_APPROVED: 'listing_approved',
  LISTING_REJECTED: 'listing_rejected',
  BID_OUTBID: 'bid_outbid',
  AUCTION_WON: 'auction_won',
  AUCTION_LOST: 'auction_lost',
  AUCTION_ENDING_SOON: 'auction_ending_soon',
  ORDER_STATUS_CHANGED: 'order_status_changed',
  WITHDRAWAL_APPROVED: 'withdrawal_approved',
  WITHDRAWAL_REJECTED: 'withdrawal_rejected',
};

const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
};

/**
 * Business rules jo doc me diye gaye hain.
 *
 * NOTE: MAX_HOUR_METER doc me "10-15k" likha hai — ye ek range hai, exact
 * value nahi. Client se confirm karna hai. Abhi 15000 rakh raha hoon,
 * par ye ek jagah change karne se poore system me change ho jaayega.
 */
const BUSINESS_RULES = {
  MAX_EQUIPMENT_AGE_YEARS: 5,   // 5 saal se purana equipment list nahi hoga
  MAX_HOUR_METER: 15000,        // TODO: client se exact number confirm karo

  // Commission — basis points me rakha hai (100 bps = 1%).
  // Percentage ko float me rakhna khatarnak hai, isliye integer bps.
  ADMIN_COMMISSION_BPS_BUYER: 100,  // 1%
  ADMIN_COMMISSION_BPS_SELLER: 100, // 1%

  // EMD — ye bhi bps me
  EMD_BPS_BUYER: 200,  // 2%
  EMD_BPS_SELLER: 100, // 1%

  /**
   * Commission — doc ka rule "Admin Revenue source 1% of equipment price
   * from both buyer and seller". DESIGN DECISION: buyer poora displayed
   * price hi deta hai (koi surprise addition nahi) — dono 1% commissions
   * usi total se kaate jaate hain seller ko credit karne se pehle. Isse
   * buyer experience simple rehta hai ("jo dikha wahi diya") aur ye
   * exactly wahi hisaab hai jo maine chat me user ko explain kiya tha
   * (₹12 lakh ka example — seller ko ₹11,88,000, admin ko ₹24,000).
   */
  COMMISSION_BPS_BUYER: 100,  // 1%
  COMMISSION_BPS_SELLER: 100, // 1%

  // Auction duration (doc: 3-3 din, max 15 din, 5 extensions)
  AUCTION_BASE_DAYS: 3,
  AUCTION_MAX_EXTENSIONS: 5,
  AUCTION_MAX_TOTAL_DAYS: 15,

  /**
   * ANTI-SNIPING (auto-extend) rules.
   *
   * NOTE: Doc me sirf itna likha hai "3-3 days extendible max 15 days
   * (5 extensions)" — par ye NAHI likha ki extension MANUALLY seller
   * karega ya AUTOMATICALLY last-minute bid pe trigger hoga
   * (SCHEMA_NOTES.md ke open sawalon me se ek).
   *
   * Maine AUTO-EXTEND (anti-sniping) implement kiya hai kyunki ye
   * industry-standard practice hai — warna log jaan-boojh kar auction
   * ke aakhri second me bid daalte hain taaki doosron ko react karne
   * ka time na mile. Agar client manual extension chahta hai, to sirf
   * `auction.service.js` ke `placeBid()` me ye check hataana padega —
   * baaki poora system same rahega.
   */
  AUCTION_EXTEND_WINDOW_MINUTES: 5, // is window ke andar bid aayi to extend hoga
  AUCTION_EXTEND_BY_MINUTES: 5,     // itna time aur mil jaayega
};

module.exports = {
  USER_ROLE,
  USER_STATUS,
  KYC_STATUS,
  LISTING_STATUS,
  LISTING_TYPE,
  EQUIPMENT_CONDITION,
  MEDIA_TYPE,
  ADMIN_ROLE,
  PERMISSION,
  OTP_PURPOSE,
  AUDIT_ACTION,
  LANGUAGE,
  BUSINESS_RULES,
  AUCTION_STATUS,
  EMD_STATUS,
  WALLET_TXN_TYPE,
  PAYMENT_PURPOSE,
  PAYMENT_STATUS,
  ORDER_STATUS,
  WITHDRAWAL_STATUS,
  NOTIFICATION_TYPE,
  TICKET_STATUS,
};
