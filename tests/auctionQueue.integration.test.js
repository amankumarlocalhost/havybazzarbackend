/**
 * Ye ASLI Redis ke saath test hota hai (mock nahi) — sandbox me Redis
 * install karke chalaya gaya (`redis-server --daemonize yes`). MongoDB
 * ke uljhan se alag, Redis is environment me genuinely available hai.
 *
 * Ye confirm karta hai: job schedule hoti hai, delay ke baad worker
 * usko process karta hai, aur "close" job ko "start" job se pehle
 * schedule kiya jaaye to bhi sahi order me chalti hai (apne apne delay
 * ke hisaab se) — bina kisi MongoDB/auction.service dependency ke,
 * seedha BullMQ ka queue+worker mechanism test kiya gaya hai ek
 * standalone queue pe.
 */
process.env.REDIS_URL = 'redis://localhost:6379';

const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

describe('BullMQ + Redis — real integration (no mocks)', () => {
  let queue;
  let worker;
  let connection;
  const QUEUE_NAME = 'test-auction-lifecycle';

  beforeAll(() => {
    connection = new IORedis('redis://localhost:6379', { maxRetriesPerRequest: null });
    queue = new Queue(QUEUE_NAME, { connection });
  });

  afterEach(async () => {
    if (worker) {
      await worker.close();
      worker = null;
    }
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    await connection.quit();
  });

  test('job schedule hoti hai aur delay ke baad worker usse process karta hai', (done) => {
    worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        expect(job.name).toBe('start');
        expect(job.data.auctionId).toBe('auction-123');
        done();
      },
      { connection }
    );

    queue.add('start', { auctionId: 'auction-123' }, { delay: 200 });
  }, 10000);

  test('do jobs apne-apne delay ke hisaab se sahi order me process hoti hain', (done) => {
    const processedOrder = [];

    worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        processedOrder.push(job.name);
        if (processedOrder.length === 2) {
          expect(processedOrder).toEqual(['first', 'second']);
          done();
        }
      },
      { connection }
    );

    // "second" pehle add hui par zyada delay ke saath — "first" ko
    // pehle process hona chahiye, jaisa auction start-before-close hota hai
    queue.add('second', {}, { delay: 500 });
    queue.add('first', {}, { delay: 100 });
  }, 10000);

  test('jobId se duplicate job replace hoti hai (reschedule pattern)', async () => {
    await queue.add('close', { round: 1 }, { delay: 5000, jobId: 'close-test-auction' });

    const existingJob = await queue.getJob('close-test-auction');
    expect(existingJob).not.toBeNull();
    expect(existingJob.data.round).toBe(1);

    // Purani job hataake nayi delay se dobara add — jaisa
    // rescheduleAuctionClose() karta hai jab auction extend hoti hai
    await existingJob.remove();
    await queue.add('close', { round: 2 }, { delay: 3000, jobId: 'close-test-auction' });

    const updatedJob = await queue.getJob('close-test-auction');
    expect(updatedJob.data.round).toBe(2);
  });
});
