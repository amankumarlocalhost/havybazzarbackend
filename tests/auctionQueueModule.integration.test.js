/**
 * Ye asli `src/jobs/auctionQueue.js` file ka test hai — generic BullMQ
 * nahi, humara khud ka code jo `scheduleAuctionStart`, `scheduleAuctionClose`,
 * aur `rescheduleAuctionClose` export karta hai. Real Redis ke saath.
 */
process.env.REDIS_URL = 'redis://localhost:6379';

const {
  getAuctionQueue,
  getConnection,
  scheduleAuctionStart,
  scheduleAuctionClose,
  rescheduleAuctionClose,
} = require('../src/jobs/auctionQueue');

describe('auctionQueue.js — humara asli module, real Redis ke saath', () => {
  afterAll(async () => {
    const queue = getAuctionQueue();
    await queue.obliterate({ force: true });
    await queue.close();
    await getConnection().quit();
  });

  test('scheduleAuctionStart ek "start" job banata hai sahi jobId ke saath', async () => {
    const auctionId = '507f1f77bcf86cd799439011';
    await scheduleAuctionStart(auctionId, new Date(Date.now() + 60000));

    const job = await getAuctionQueue().getJob(`start-${auctionId}`);
    expect(job).not.toBeNull();
    expect(job.name).toBe('start');
    expect(job.data.auctionId).toBe(auctionId);
  });

  test('scheduleAuctionClose ek "close" job banata hai sahi jobId ke saath', async () => {
    const auctionId = '507f1f77bcf86cd799439012';
    await scheduleAuctionClose(auctionId, new Date(Date.now() + 120000));

    const job = await getAuctionQueue().getJob(`close-${auctionId}`);
    expect(job).not.toBeNull();
    expect(job.name).toBe('close');
  });

  test('rescheduleAuctionClose purani job hataake nayi delay se banata hai (extension use-case)', async () => {
    const auctionId = '507f1f77bcf86cd799439013';
    await scheduleAuctionClose(auctionId, new Date(Date.now() + 60000));

    const firstJob = await getAuctionQueue().getJob(`close-${auctionId}`);
    const firstDelay = firstJob.delay;

    // Auction extend hui — naya, bada end time
    await rescheduleAuctionClose(auctionId, new Date(Date.now() + 300000));

    const updatedJob = await getAuctionQueue().getJob(`close-${auctionId}`);
    expect(updatedJob).not.toBeNull();
    expect(updatedJob.delay).toBeGreaterThan(firstDelay); // naya delay bada hona chahiye
  });

  test('past ka startTime bhi crash nahi karta — delay 0 pe clamp hota hai', async () => {
    const auctionId = '507f1f77bcf86cd799439014';
    // startTime already beet chuka (jaise admin ne der se approve kiya)
    await expect(scheduleAuctionStart(auctionId, new Date(Date.now() - 100000))).resolves.not.toThrow();

    const job = await getAuctionQueue().getJob(`start-${auctionId}`);
    expect(job.delay).toBe(0);
  });
});
