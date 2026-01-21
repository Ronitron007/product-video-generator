import { json, ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { getOrCreateShop, canGenerateVideo } from '~/services/shop.server';
import { createVideoJob } from '~/services/video-job.server';
import { addVideoJob } from '~/lib/queue.server';
import { logger, logRequest } from '~/lib/logger.server';

export async function action({ request }: ActionFunctionArgs) {
  const reqLog = logRequest('api.generate');

  try {
    const { session } = await authenticate.admin(request);
    logger.info('Generate video request', { shopDomain: session.shop, route: 'api.generate' });

    const shop = await getOrCreateShop(session.shop, session.accessToken || '');
    logger.debug('Shop resolved', { shopId: shop.id, shopDomain: session.shop, plan: shop.plan });

    // Check plan limits
    if (!canGenerateVideo(shop)) {
      logger.warn('Plan limit reached', { shopId: shop.id, shopDomain: session.shop, plan: shop.plan, videosUsed: shop.videosUsedThisMonth });
      reqLog.end('error', { reason: 'limit_reached' });
      return json(
        { error: 'limit_reached', upgradeRequired: true },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const productId = formData.get('productId') as string;
    const imageUrls = JSON.parse(formData.get('imageUrls') as string) as string[];
    const templateId = formData.get('templateId') as string;

    // Validate
    if (!productId || !imageUrls?.length || !templateId) {
      logger.warn('Missing required fields', { shopDomain: session.shop, productId, templateId, imageCount: imageUrls?.length });
      reqLog.end('error', { reason: 'missing_fields' });
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (imageUrls.length > 3) {
      logger.warn('Too many images', { shopDomain: session.shop, imageCount: imageUrls.length });
      reqLog.end('error', { reason: 'too_many_images' });
      return json({ error: 'Maximum 3 images allowed' }, { status: 400 });
    }

    // Create job in database
    const videoJob = await createVideoJob({
      shopId: shop.id,
      shopifyProductId: productId,
      sourceImageUrls: imageUrls,
      templateId,
    });

    logger.info('Video job created', { jobId: videoJob.id, shopId: shop.id, productId, templateId });

    // Add to queue
    await addVideoJob({
      jobId: videoJob.id,
      shopId: shop.id,
      sourceImageUrls: imageUrls,
      templateId,
    });

    logger.info('Video job queued', { jobId: videoJob.id });
    reqLog.end('success', { jobId: videoJob.id });

    return json({ success: true, jobId: videoJob.id });
  } catch (error) {
    logger.error('Generate video failed', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    reqLog.end('error', { reason: 'exception' });
    throw error;
  }
}
