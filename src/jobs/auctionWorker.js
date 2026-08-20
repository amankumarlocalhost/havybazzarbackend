/**
 * auctionWorker.js
 * ---------------------------------------------------------------------------
 * Ye worker background me chalta hai (server.js se start hoga) aur
 * auctionQueue.js se schedule ki gayi jobs ko process karta hai.
 *
 * auction.service.js ko yahan late require kiya hai (function ke andar,
 * top-level nahi) — circular dependency se bachne ke liye, kyunki
 * auction.service khud auctionQueue ko import karta hai scheduling ke liye.
 * ---------------------------------------------------------------------------
 */

const { Worker } = require('bullmq');
const { getConnection } = require('./auctionQueue');

let worker = null;

function startAuctionWorker() {
  if (worker) return worker;

  worker = new Worker(
    'auction-lifecycle',
    async (job) => {
      const auctionService = require('../services/auction.service');

      if (job.name === 'start') {
        await auctionService.startAuction(job.data.auctionId);
      } else if (job.name === 'close') {
        await auctionService.closeAuction(job.data.auctionId);
      }
    },
    { connection: getConnection() }
  );

  worker.on('failed', (job, err) => {
    console.error(`Auction job "${job?.name}" (${job?.id}) fail hui:`, err.message);
  });

  console.log('Auction worker chal raha hai — start/close jobs process karega');
  return worker;
}

module.exports = { startAuctionWorker };
