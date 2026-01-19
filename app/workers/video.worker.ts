import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '~/lib/db.server';
import { generateVideo, pollVideoStatus } from '~/lib/veo.server';
import { getTemplate } from '~/config/templates';
import { updateJobStatus } from '~/services/video-job.server';
import { incrementVideosUsed } from '~/services/shop.server';

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export interface VideoJobData {
  jobId: string;
  shopId: string;
  sourceImageUrls: string[];
  templateId: string;
}

async function processVideoJob(job: Job<VideoJobData>) {
  const { jobId, shopId, sourceImageUrls, templateId } = job.data;

  try {
    // Update status to processing
    await updateJobStatus(jobId, 'processing');

    // Get template
    const template = getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Generate video
    const { operationId } = await generateVideo({
      prompt: template.prompt,
      referenceImageUrls: sourceImageUrls,
      duration: template.duration,
    });

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5s intervals

    while (attempts < maxAttempts) {
      const status = await pollVideoStatus(operationId);

      if (status.done) {
        if (status.error) {
          throw new Error(status.error);
        }

        // Success - update job with video URL
        await updateJobStatus(jobId, 'done', { videoUrl: status.videoUrl });
        await incrementVideosUsed(shopId);
        return { success: true, videoUrl: status.videoUrl };
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error('Video generation timed out');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateJobStatus(jobId, 'failed', { errorMessage });
    throw error;
  }
}

export function startVideoWorker() {
  const worker = new Worker('video-generation', processVideoJob, {
    connection,
    concurrency: 2,
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  return worker;
}
