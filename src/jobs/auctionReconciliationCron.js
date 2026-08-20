/**
 * auctionReconciliationCron.js
 * ---------------------------------------------------------------------------
 * SAFETY NET. BullMQ jobs Redis me persist hoti hain, isliye normally
 * safe hain — par "normally" kaafi nahi hai jab paisa (EMD) involved ho.
 * Redis crash, deployment glitch, ya koi bhi wajah se job miss ho sakti
 * hai. Ye cron har minute check karta hai:
 *
 *   - Koi LIVE auction jiska endTime nikal chuka par abhi bhi "live" hai
 *     -> closeAuction() call karo
 *   - Koi SCHEDULED auction jiska startTime aa chuka par abhi bhi
 *     "scheduled" hai -> startAuction() call karo
 *
 * `node-cron` jaisi extra library nahi lagayi — setInterval hi kaafi hai
 * itne simple periodic check ke liye.
 * ---------------------------------------------------------------------------
 */

const Auction = require('../models/auction.model');
const { AUCTION_STATUS } = require('../constants/enums');

const CHECK_INTERVAL_MS = 60 * 1000; // har minute

let intervalHandle = null;

async function runReconciliation() {
  const auctionService = require('../services/auction.service');
  const now = new Date();

  try {
    const missedStarts = await Auction.find({ status: AUCTION_STATUS.SCHEDULED, startTime: { $lte: now } });
    for (const auction of missedStarts) {
      console.warn(`[reconciliation] Missed start job found: auction ${auction._id}`);
      await auctionService.startAuction(auction._id).catch((err) => console.error(err.message));
    }

    const missedCloses = await Auction.find({ status: AUCTION_STATUS.LIVE, endTime: { $lte: now } });
    for (const auction of missedCloses) {
      console.warn(`[reconciliation] Missed close job found: auction ${auction._id}`);
      await auctionService.closeAuction(auction._id).catch((err) => console.error(err.message));
    }
  } catch (err) {
    console.error('[reconciliation] cron run fail hua:', err.message);
  }
}

function startReconciliationCron() {
  if (intervalHandle) return;
  intervalHandle = setInterval(runReconciliation, CHECK_INTERVAL_MS);
  console.log('Auction reconciliation cron chal raha hai (har minute check)');
}

function stopReconciliationCron() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { startReconciliationCron, stopReconciliationCron, runReconciliation };
