const { Queue } = require('bullmq');
const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MEET_QUEUE_NAME = 'meet-queue';

const redisConnection = new Redis(REDIS_URL, {
  family: 4,
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
});

redisConnection.on('error', (error) => {
  console.error('[meet-queue:redis] Connection error:', error.message);
});

const meetQueue = new Queue(MEET_QUEUE_NAME, {
  connection: redisConnection,
});

async function enqueueMeetJob(meetJob, options = {}) {
  return meetQueue.add(
    meetJob.operation,
    { meetJobId: meetJob.id },
    {
      jobId: `meet-${meetJob.id}-${Date.now()}`,
      attempts: options.attempts || 3,
      backoff: options.backoff || { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
      delay: options.delay || 0,
    },
  );
}

module.exports = {
  MEET_QUEUE_NAME,
  meetQueue,
  enqueueMeetJob,
  redisConnection,
};
