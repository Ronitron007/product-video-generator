import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '~/lib/db.server';
import { generateVideo, pollVideoStatus } from '~/lib/veo.server';
import { getTemplate } from '~/config/templates';
import { updateJobStatus } from '~/services/video-job.server';
import { incrementVideosUsed } from '~/services/shop.server';
import { logger } from '~/lib/logger.server';

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

  logger.info('Processing video job', { jobId, shopId, templateId, imageCount: sourceImageUrls.length });

  try {
    // Update status to processing
    await updateJobStatus(jobId, 'processing');
    logger.debug('Job status updated to processing', { jobId });

    // Get template
    const template = getTemplate(templateId);
    if (!template) {
      logger.error('Template not found', { jobId, templateId });
      throw new Error(`Template not found: ${templateId}`);
    }

    // Generate video
    logger.info('Starting video generation', { jobId, templateId, prompt: template.prompt.substring(0, 50) });
    const { operationId } = await generateVideo({
      prompt: template.prompt,
      referenceImageUrls: sourceImageUrls,
      duration: template.duration,
    });

    logger.info('Video generation started', { jobId, operationId });

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5s intervals

    while (attempts < maxAttempts) {
      const status = await pollVideoStatus(operationId);

      if (status.done) {
        if (status.error) {
          logger.error('Video generation failed', { jobId, operationId, error: status.error });
          throw new Error(status.error);
        }

        // Success - update job with video URL
        await updateJobStatus(jobId, 'done', { videoUrl: status.videoUrl });
        await incrementVideosUsed(shopId);
        logger.info('Video generation completed', { jobId, operationId, videoUrl: status.videoUrl });
        return { success: true, videoUrl: status.videoUrl };
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;

      if (attempts % 6 === 0) {
        logger.debug('Video generation in progress', { jobId, operationId, attempts, maxAttempts });
      }
    }

    logger.error('Video generation timed out', { jobId, operationId, attempts });
    throw new Error('Video generation timed out');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Video job failed', { jobId, shopId, error: errorMessage });
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
    logger.info('Worker job completed', { bullJobId: job.id, jobId: job.data.jobId });
  });

  worker.on('failed', (job, err) => {
    logger.error('Worker job failed', { bullJobId: job?.id, jobId: job?.data?.jobId, error: err.message });
  });

  logger.info('Video worker started', { concurrency: 2 });

  return worker;
}
