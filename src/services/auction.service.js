/**
 * auction.service.js
 * ---------------------------------------------------------------------------
 * BID PLACEMENT ATOMICITY — is file ka sabse zaroori hissa:
 *
 * Do log ek hi second me bid karenge — ye guaranteed hai. Agar code
 * "pehle read karo, phir compare karo, phir write karo" pattern se likha
 * jaaye, to dono ki bid accept ho sakti hai aur data corrupt ho sakta
 * hai. Isliye `placeBid()` MongoDB TRANSACTION (session) use karta hai —
 * poora read-compute-write ek atomic unit ban jaata hai. Agar do
 * transactions clash karein, MongoDB khud ek ko fail kar dega
 * (TransientTransactionError) aur hum use retry kar lete hain.
 *
 * NOTE: Transactions sirf REPLICA SET pe kaam karte hain. MongoDB Atlas
 * (jo Aman use kar rahe hain) default replica set hi hota hai, isliye
 * ye production me kaam karega. Local standalone MongoDB pe nahi chalega
 * (agar koi local test kare) — Atlas connection string se hi test karein.
 * ---------------------------------------------------------------------------
 */

const mongoose = require('mongoose');
const Auction = require('../models/auction.model');
const Bid = require('../models/bid.model');
const AutoBid = require('../models/autoBid.model');
const AuctionParticipant = require('../models/auctionParticipant.model');
const Listing = require('../models/listing.model');
const User = require('../models/user.model');
const AppError = require('../utils/AppError');
const categoryService = require('./category.service');
const walletService = require('./wallet.service');
const { emitToAuction } = require('../sockets');
const {
  scheduleAuctionStart,
  scheduleAuctionClose,
  rescheduleAuctionClose,
} = require('../jobs/auctionQueue');
const {
  validateBidAmount,
  resolveAuctionState,
  isWithinExtensionWindow,
  computeExtendedEndTime,
  canExtend,
} = require('../utils/auctionMath');
const { AUCTION_STATUS, EMD_STATUS, LISTING_STATUS, KYC_STATUS, BUSINESS_RULES } = require('../constants/enums');

const MAX_RETRIES = 3;

// -----------------------------------------------------------------------
// SCHEDULING — listing.service.js ka adminReview() ise call karega
// -----------------------------------------------------------------------

async function scheduleAuctionJobs(auctionId, startTime, endTime) {
  await scheduleAuctionStart(auctionId, startTime);
  await scheduleAuctionClose(auctionId, endTime);
}

// -----------------------------------------------------------------------
// JOIN (EMD) — PHASE 7 STUB
// -----------------------------------------------------------------------

/**
 * PHASE 7 STUB: real Razorpay order + webhook abhi connect nahi hai.
 * Abhi ye seedha "EMD paid" maan ke participant record bana deta hai —
 * jaisa listing.service.js ka markSellerEmdPaid() bhi stub hai. Jab
 * Phase 7 banega, is function se PEHLE ek Razorpay order create hoga,
 * aur webhook confirm hone ke BAAD hi ye call hoga.
 */
/**
 * Payment initiate karne se PEHLE ka check — Razorpay order banane se
 * pehle hi confirm kar lo ki user eligible hai, warna paisa lene ke
 * baad "sorry aap eligible nahi ho" bolna bahut bura UX hai.
 */
async function checkCanJoinAuction(auctionId, userId) {
  const auction = await Auction.findById(auctionId);
  if (!auction) throw new AppError('Auction not found.', 404);

  if (![AUCTION_STATUS.SCHEDULED, AUCTION_STATUS.LIVE].includes(auction.status)) {
    throw new AppError(`This auction is in "${auction.status}" state and cannot be joined.`, 400);
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found.', 404);

  if (user.kycStatus !== KYC_STATUS.VERIFIED) {
    throw new AppError('You must verify your KYC before joining an auction.', 403);
  }

  const existing = await AuctionParticipant.findOne({ auctionId, userId });

  return { auction, alreadyJoined: !!existing };
}

/**
 * Payment verify hone ke BAAD `payment.service.js` isko call karta hai —
 * yahi asli participant record banta hai. Dobara call ho (jaise webhook
 * aur client-verify dono chal jaayein) to idempotent hai — dusri baar
 * bas purana record wapas kar dega.
 */
async function confirmBuyerEmdPaid(auctionId, userId) {
  const auction = await Auction.findById(auctionId);
  if (!auction) throw new AppError('Auction not found.', 404);

  const existing = await AuctionParticipant.findOne({ auctionId, userId });
  if (existing) {
    return existing; // already confirmed — idempotent
  }

  const participant = await AuctionParticipant.create({
    auctionId,
    userId,
    emdAmountPaise: auction.emdAmountPaise,
    emdStatus: EMD_STATUS.HELD,
  });

  return participant;
}

// -----------------------------------------------------------------------
// PLACE BID — sabse critical function
// -----------------------------------------------------------------------

async function placeBid(auctionId, bidderId, bidAmountPaise) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const auction = await Auction.findById(auctionId).session(session);
      if (!auction) throw new AppError('Auction not found.', 404);

      if (auction.status !== AUCTION_STATUS.LIVE) {
        throw new AppError(`Auction is not live yet (status: ${auction.status}).`, 400);
      }
      if (new Date() > auction.endTime) {
        throw new AppError('This auction has ended.', 400);
      }

      const participant = await AuctionParticipant.findOne({
        auctionId,
        userId: bidderId,
        emdStatus: EMD_STATUS.HELD,
      }).session(session);
      if (!participant) {
        throw new AppError('You must pay the EMD before bidding.', 403);
      }

      if (auction.sellerId.toString() === bidderId.toString()) {
        throw new AppError('You cannot bid on your own listing.', 400);
      }

      const { valid, minRequiredPaise } = validateBidAmount({
        bidAmountPaise,
        currentHighestPaise: auction.currentHighestBidPaise,
        minIncrementPaise: auction.minIncrementPaise,
        startingBidPaise: auction.startingBidPaise,
      });
      if (!valid) {
        throw new AppError(
          `Bid must be at least Rs ${(minRequiredPaise / 100).toLocaleString('en-IN')}.`,
          400
        );
      }

      const activeAutoBids = await AutoBid.find({ auctionId, isActive: true }).session(session);
      const maxBidsMap = new Map();
      activeAutoBids.forEach((ab) => maxBidsMap.set(ab.bidderId.toString(), ab.maxAmountPaise));
      maxBidsMap.set(bidderId.toString(), bidAmountPaise);

      const activeMaxBids = [...maxBidsMap.entries()].map(([id, maxAmountPaise]) => ({
        bidderId: id,
        maxAmountPaise,
      }));

      const resolved = resolveAuctionState({
        startingBidPaise: auction.startingBidPaise,
        minIncrementPaise: auction.minIncrementPaise,
        activeMaxBids,
      });

      await Bid.create([{ auctionId, bidderId, amountPaise: bidAmountPaise, isAutoBid: false }], { session });

      if (resolved.leaderId !== bidderId.toString()) {
        await Bid.create(
          [{ auctionId, bidderId: resolved.leaderId, amountPaise: resolved.currentPricePaise, isAutoBid: true }],
          { session }
        );
      }

      let extended = false;
      if (isWithinExtensionWindow(auction.endTime, new Date(), BUSINESS_RULES.AUCTION_EXTEND_WINDOW_MINUTES)) {
        const proposedEndTime = computeExtendedEndTime(auction.endTime, BUSINESS_RULES.AUCTION_EXTEND_BY_MINUTES);
        if (
          canExtend({
            extensionCount: auction.extensionCount,
            maxExtensions: BUSINESS_RULES.AUCTION_MAX_EXTENSIONS,
            startTime: auction.startTime,
            proposedNewEndTime: proposedEndTime,
            maxTotalDays: BUSINESS_RULES.AUCTION_MAX_TOTAL_DAYS,
          })
        ) {
          auction.endTime = proposedEndTime;
          auction.extensionCount += 1;
          extended = true;
        }
      }

      const previousLeaderId = auction.currentLeaderId ? auction.currentLeaderId.toString() : null;

      auction.currentHighestBidPaise = resolved.currentPricePaise;
      auction.currentLeaderId = resolved.leaderId;
      auction.totalBidsCount += 1;
      await auction.save({ session });

      await session.commitTransaction();
      session.endSession();

      if (extended) {
        await rescheduleAuctionClose(auction._id, auction.endTime);
      }

      // Jo pehle leader tha, agar ab nahi hai — usko "outbid" notification
      // (transaction commit hone ke BAAD, taaki retry pe duplicate na bhejein)
      if (previousLeaderId && previousLeaderId !== resolved.leaderId) {
        const notificationService = require('./notification.service');
        const listing = await Listing.findById(auction.listingId).select('title');
        notificationService
          .notify(previousLeaderId, 'bid_outbid', {
            title: listing ? listing.title : 'Equipment',
            amountPaise: resolved.currentPricePaise,
          })
          .catch((err) => console.error('Outbid notification fail hui:', err.message));
      }

      emitToAuction(auctionId, 'bid:new', {
        currentHighestBidPaise: auction.currentHighestBidPaise,
        currentLeaderId: auction.currentLeaderId,
        totalBidsCount: auction.totalBidsCount,
        endTime: auction.endTime,
        extended,
      });

      return auction;
    } catch (err) {
      await session.abortTransaction().catch(() => {});
      session.endSession();

      const isRetryable = err.errorLabels && err.errorLabels.includes('TransientTransactionError');
      if (isRetryable && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }

  throw new AppError('Could not place bid (too many concurrent bids). Please try again.', 409);
}

// -----------------------------------------------------------------------
// AUTO-BID (proxy) SET KARNA
// -----------------------------------------------------------------------

async function setAutoBid(auctionId, bidderId, maxAmountPaise) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const auction = await Auction.findById(auctionId).session(session);
      if (!auction) throw new AppError('Auction not found.', 404);
      if (auction.status !== AUCTION_STATUS.LIVE) {
        throw new AppError(`Auction is not live yet (status: ${auction.status}).`, 400);
      }

      const participant = await AuctionParticipant.findOne({
        auctionId,
        userId: bidderId,
        emdStatus: EMD_STATUS.HELD,
      }).session(session);
      if (!participant) throw new AppError('You must pay the EMD before setting an auto-bid.', 403);

      if (maxAmountPaise < auction.startingBidPaise) {
        throw new AppError('Auto-bid max cannot be less than the starting bid.', 400);
      }

      await AutoBid.findOneAndUpdate(
        { auctionId, bidderId },
        { maxAmountPaise, isActive: true },
        { upsert: true, session }
      );

      const activeAutoBids = await AutoBid.find({ auctionId, isActive: true }).session(session);
      const activeMaxBids = activeAutoBids.map((ab) => ({
        bidderId: ab.bidderId.toString(),
        maxAmountPaise: ab.maxAmountPaise,
      }));

      const resolved = resolveAuctionState({
        startingBidPaise: auction.startingBidPaise,
        minIncrementPaise: auction.minIncrementPaise,
        activeMaxBids,
      });

      const leaderChanged =
        resolved.leaderId !== (auction.currentLeaderId ? auction.currentLeaderId.toString() : null);

      if (leaderChanged || resolved.currentPricePaise !== auction.currentHighestBidPaise) {
        await Bid.create(
          [{ auctionId, bidderId: resolved.leaderId, amountPaise: resolved.currentPricePaise, isAutoBid: true }],
          { session }
        );
        auction.totalBidsCount += 1;
      }

      auction.currentHighestBidPaise = resolved.currentPricePaise;
      auction.currentLeaderId = resolved.leaderId;
      await auction.save({ session });

      await session.commitTransaction();
      session.endSession();

      emitToAuction(auctionId, 'bid:new', {
        currentHighestBidPaise: auction.currentHighestBidPaise,
        currentLeaderId: auction.currentLeaderId,
        totalBidsCount: auction.totalBidsCount,
      });

      return { auction, isLeading: resolved.leaderId === bidderId.toString() };
    } catch (err) {
      await session.abortTransaction().catch(() => {});
      session.endSession();

      const isRetryable = err.errorLabels && err.errorLabels.includes('TransientTransactionError');
      if (isRetryable && attempt < MAX_RETRIES - 1) continue;
      throw err;
    }
  }

  throw new AppError('Could not set auto-bid. Please try again.', 409);
}

// -----------------------------------------------------------------------
// AUCTION LIFECYCLE — BullMQ jobs (aur reconciliation cron) call karte hain
// -----------------------------------------------------------------------

async function startAuction(auctionId) {
  const auction = await Auction.findById(auctionId);
  if (!auction) return;

  if (auction.status !== AUCTION_STATUS.SCHEDULED) {
    return; // already start ho chuka, ya cancel ho chuka — idempotent
  }

  auction.status = AUCTION_STATUS.LIVE;
  await auction.save();

  emitToAuction(auctionId, 'auction:started', { auctionId: auction._id, endTime: auction.endTime });
}

/**
 * Auction band karta hai — winner decide karta hai, EMD resolve karta
 * hai (won/lost/forfeited), listing status update karta hai.
 */
async function closeAuction(auctionId) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const auction = await Auction.findById(auctionId).session(session);
    if (!auction) {
      await session.abortTransaction();
      session.endSession();
      return;
    }

    if (auction.status !== AUCTION_STATUS.LIVE) {
      await session.abortTransaction();
      session.endSession();
      return; // already closed — idempotent
    }

    const listing = await Listing.findById(auction.listingId).session(session);
    const reserveMet = !auction.reservePricePaise || auction.currentHighestBidPaise >= auction.reservePricePaise;
    const hasWinner = auction.currentLeaderId && reserveMet;

    const participants = await AuctionParticipant.find({ auctionId }).session(session);

    if (hasWinner) {
      auction.winnerId = auction.currentLeaderId;
      auction.winningBidPaise = auction.currentHighestBidPaise;
      auction.closeReason = 'Winner declared';

      if (listing) {
        listing.status = LISTING_STATUS.SOLD;
        await listing.save({ session });
      }

      for (const p of participants) {
        const isWinner = p.userId.toString() === auction.winnerId.toString();
        p.emdStatus = isWinner ? EMD_STATUS.ADJUSTED : EMD_STATUS.RELEASED;
        p.resolvedAt = new Date();
        await p.save({ session });

        // Haarne walon ka EMD wallet me HB Coins ban jaata hai —
        // jeetne wale ka EMD final order price me adjust hoga
        // (order.service.js create karega, ledger entry nahi chahiye)
        if (!isWinner) {
          await walletService.creditFromEmdRelease(p.userId, p.emdAmountPaise, auction._id, session);
        }
      }
    } else {
      auction.closeReason = auction.currentLeaderId ? 'Reserve price not met' : 'No bids received';

      if (listing) {
        listing.status = LISTING_STATUS.EXPIRED;
        await listing.save({ session });
      }

      for (const p of participants) {
        p.emdStatus = EMD_STATUS.RELEASED;
        p.resolvedAt = new Date();
        await p.save({ session });
        await walletService.creditFromEmdRelease(p.userId, p.emdAmountPaise, auction._id, session);
      }
    }

    auction.status = AUCTION_STATUS.CLOSED;
    auction.closedAt = new Date();
    await auction.save({ session });

    await session.commitTransaction();
    session.endSession();

    if (listing) {
      await categoryService.syncListingCount(listing.categoryId, -1);
    }

    emitToAuction(auctionId, 'auction:closed', {
      auctionId: auction._id,
      winnerId: auction.winnerId,
      winningBidPaise: auction.winningBidPaise,
      closeReason: auction.closeReason,
    });

    // Transaction commit hone ke BAAD notifications — fire and forget,
    // response ke liye inka wait nahi karna
    const notificationService = require('./notification.service');
    const listingTitle = listing ? listing.title : 'Equipment';

    participants.forEach((p) => {
      const isWinner = hasWinner && p.userId.toString() === auction.winnerId.toString();
      const type = isWinner ? 'auction_won' : 'auction_lost';
      notificationService
        .notify(p.userId, type, { title: listingTitle })
        .catch((err) => console.error('Auction close notification fail hui:', err.message));
    });
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    session.endSession();
    throw err;
  }
}

// -----------------------------------------------------------------------
// READ — buyer/seller ke liye
// -----------------------------------------------------------------------

async function getAuctionDetail(auctionId) {
  const auction = await Auction.findById(auctionId)
    .populate('listingId', 'title media')
    .populate('currentLeaderId', 'fullName email')
    .populate('winnerId', 'fullName email');
  if (!auction) throw new AppError('Auction not found.', 404);

  const recentBids = await Bid.find({ auctionId })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('bidderId', 'fullName');

  return { auction, recentBids };
}

/**
 * ADMIN — sab auctions dekhna, status se filter (live/scheduled/closed).
 * Doc ka rule: bidders ki identity seller se hidden rehti hai, par
 * admin ko sab dikhta hai (dispute resolution ke liye zaroori).
 */
async function adminListAuctions({ status, page = 1, limit = 20 }) {
  const query = {};
  if (status) query.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Auction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('listingId', 'title')
      .populate('sellerId', 'fullName email')
      .populate('currentLeaderId', 'fullName email'),
    Auction.countDocuments(query),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function getMyBids(userId) {
  const participations = await AuctionParticipant.find({ userId }).populate({
    path: 'auctionId',
    populate: { path: 'listingId', select: 'title media' },
  });

  const results = await Promise.all(
    participations.map(async (p) => {
      const auction = p.auctionId;
      if (!auction) return null;

      const myHighestBid = await Bid.findOne({ auctionId: auction._id, bidderId: userId }).sort({
        amountPaise: -1,
      });

      let status;
      if (auction.status === AUCTION_STATUS.LIVE) {
        status =
          auction.currentLeaderId && auction.currentLeaderId.toString() === userId.toString()
            ? 'active'
            : 'outbid';
      } else if (auction.status === AUCTION_STATUS.CLOSED) {
        status = auction.winnerId && auction.winnerId.toString() === userId.toString() ? 'won' : 'lost';
      } else {
        status = 'pending';
      }

      return {
        auction,
        myHighestBidPaise: myHighestBid ? myHighestBid.amountPaise : null,
        emdStatus: p.emdStatus,
        status,
      };
    })
  );

  return results.filter(Boolean);
}

module.exports = {
  scheduleAuctionJobs,
  checkCanJoinAuction,
  confirmBuyerEmdPaid,
  placeBid,
  setAutoBid,
  startAuction,
  closeAuction,
  getAuctionDetail,
  getMyBids,
  adminListAuctions,
};
