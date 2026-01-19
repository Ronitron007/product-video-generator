import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export const videoQueue = new Queue('video-generation', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export interface VideoJobData {
  jobId: string;
  shopId: string;
  sourceImageUrls: string[];
  templateId: string;
}

export async function addVideoJob(data: VideoJobData) {
  return videoQueue.add('generate', data);
}
