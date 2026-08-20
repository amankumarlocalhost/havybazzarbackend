/**
 * auctionQueue.js
 * ---------------------------------------------------------------------------
 * Auction start/close karne ke liye delayed jobs. Auction create hote hi
 * (ya approve hote hi) do jobs schedule ho jaate hain — ek startTime pe,
 * ek endTime pe.
 *
 * ⚠️ SAFETY NET ZAROORI HAI: agar server restart ho jaaye, BullMQ jobs
 * memory me nahi hoti (Redis me persist hoti hain, isliye actually safe
 * hain agar Redis persistent hai) — par phir bhi `auctionReconciliationCron.js`
 * ek extra safety net hai jo har minute check karta hai koi auction
 * expire hokar close hone se reh to nahi gaya. Kabhi bhi SIRF queue pe
 * bharosa mat kijiye.
 * ---------------------------------------------------------------------------
 */

const { Queue } = require('bullmq');
const IORedis = require('ioredis');

let connection = null;
let auctionQueue = null;

function getConnection() {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // BullMQ ki requirement
      connectTimeout: 3000,
      // Redis down hone pe ioredis default INFINITE retry karta hai — isse
      // koi bhi API call jo queue.add() karti hai (jaise admin "Approve")
      // hamesha ke liye hang ho jaati hai. Kuch attempts ke baad give up
      // karo, taaki connection turant "closed" error de, hang na ho.
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
    });
    connection.on('error', (err) => {
      console.error('Redis connection error (auction queue):', err.message);
    });
  }
  return connection;
}

function getAuctionQueue() {
  if (!auctionQueue) {
    auctionQueue = new Queue('auction-lifecycle', { connection: getConnection() });
  }
  return auctionQueue;
}

async function scheduleAuctionStart(auctionId, startTime) {
  const delay = Math.max(0, new Date(startTime).getTime() - Date.now());
  await getAuctionQueue().add(
    'start',
    { auctionId: auctionId.toString() },
    { delay, jobId: `start-${auctionId}`, removeOnComplete: true, removeOnFail: 100 }
  );
}

async function scheduleAuctionClose(auctionId, endTime) {
  const delay = Math.max(0, new Date(endTime).getTime() - Date.now());
  await getAuctionQueue().add(
    'close',
    { auctionId: auctionId.toString() },
    { delay, jobId: `close-${auctionId}`, removeOnComplete: true, removeOnFail: 100 }
  );
}

/**
 * Auction extend hone pe purani close-job ka time badalna hai. BullMQ me
 * seedha "reschedule" nahi hota — purani job hataake nayi delay se
 * dobara add karte hain. jobId same rakha (`close-<id>`) isliye purani
 * apne aap replace ho jaati hai agar wo abhi pending hai.
 */
async function rescheduleAuctionClose(auctionId, newEndTime) {
  const queue = getAuctionQueue();
  const existingJob = await queue.getJob(`close-${auctionId}`);
  if (existingJob) {
    await existingJob.remove();
  }
  await scheduleAuctionClose(auctionId, newEndTime);
}

module.exports = { getAuctionQueue, getConnection, scheduleAuctionStart, scheduleAuctionClose, rescheduleAuctionClose };
