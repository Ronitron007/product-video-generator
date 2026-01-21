import { ActionFunctionArgs, json } from '@remix-run/node';
import { Receiver } from '@upstash/qstash';
import { generateVideo, pollVideoStatus } from '~/lib/veo.server';
import { getTemplate } from '~/config/templates';
import { updateJobStatus } from '~/services/video-job.server';
import { incrementVideosUsed } from '~/services/shop.server';
import { logger, logRequest } from '~/lib/logger.server';

export interface VideoJobPayload {
  jobId: string;
  shopId: string;
  sourceImageUrls: string[];
  templateId: string;
}

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function action({ request }: ActionFunctionArgs) {
  const reqLog = logRequest('api.process-video');

  // Verify QStash signature
  const signature = request.headers.get('upstash-signature');
  const body = await request.text();

  if (!signature) {
    logger.warn('Missing QStash signature', { route: 'api.process-video' });
    reqLog.end('error', { reason: 'missing_signature' });
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const isValid = await receiver.verify({
      signature,
      body,
      url: request.url,
    });

    if (!isValid) {
      logger.warn('Invalid QStash signature', { route: 'api.process-video' });
      reqLog.end('error', { reason: 'invalid_signature' });
      return json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch (error) {
    logger.error('QStash verification failed', { route: 'api.process-video', error: error instanceof Error ? error.message : String(error) });
    reqLog.end('error', { reason: 'verification_failed' });
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload: VideoJobPayload = JSON.parse(body);
  const { jobId, shopId, sourceImageUrls, templateId } = payload;

  logger.info('Processing video job via QStash', { jobId, shopId, templateId, imageCount: sourceImageUrls.length });

  try {
    // Update status to processing
    await updateJobStatus(jobId, 'processing');
    logger.debug('Job status updated to processing', { jobId });

    // Get template
    const template = getTemplate(templateId);
    if (!template) {
      logger.error('Template not found', { jobId, templateId, route: 'api.process-video' });
      await updateJobStatus(jobId, 'failed', { errorMessage: `Template not found: ${templateId}` });
      reqLog.end('error', { jobId, reason: 'template_not_found' });
      return json({ error: 'Template not found' }, { status: 400 });
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
    const maxAttempts = 60; // 5 minutes with 5s intervals

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await pollVideoStatus(operationId);

      if (status.done) {
        if (status.error) {
          logger.error('Video generation failed', { jobId, operationId, error: status.error, route: 'api.process-video' });
          await updateJobStatus(jobId, 'failed', { errorMessage: status.error });
          reqLog.end('error', { jobId, reason: 'generation_failed' });
          return json({ error: status.error }, { status: 500 });
        }

        // Success - update job with video URL
        await updateJobStatus(jobId, 'done', { videoUrl: status.videoUrl });
        await incrementVideosUsed(shopId);
        logger.info('Video generation completed', { jobId, operationId, videoUrl: status.videoUrl, route: 'api.process-video' });
        reqLog.end('success', { jobId });
        return json({ success: true, videoUrl: status.videoUrl });
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 5000));

      if (attempt % 6 === 0) {
        logger.debug('Video generation in progress', { jobId, operationId, attempt, maxAttempts });
      }
    }

    logger.error('Video generation timed out', { jobId, operationId, route: 'api.process-video' });
    await updateJobStatus(jobId, 'failed', { errorMessage: 'Video generation timed out' });
    reqLog.end('error', { jobId, reason: 'timeout' });
    return json({ error: 'Video generation timed out' }, { status: 500 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Video job failed', { jobId, shopId, error: errorMessage, route: 'api.process-video' });
    await updateJobStatus(jobId, 'failed', { errorMessage });
    reqLog.end('error', { jobId, reason: 'exception' });
    return json({ error: errorMessage }, { status: 500 });
  }
}
