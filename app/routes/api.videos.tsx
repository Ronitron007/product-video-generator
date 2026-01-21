import { json, LoaderFunctionArgs } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { getOrCreateShop } from '~/services/shop.server';
import { getJobsByShop } from '~/services/video-job.server';
import { logger, logRequest } from '~/lib/logger.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const reqLog = logRequest('api.videos');

  try {
    const { session } = await authenticate.admin(request);
    logger.info('Fetching videos', { shopDomain: session.shop, route: 'api.videos' });

    const shop = await getOrCreateShop(session.shop, session.accessToken || '');
    const jobs = await getJobsByShop(shop.id);

    logger.info('Videos fetched', { shopDomain: session.shop, videoCount: jobs.length });
    reqLog.end('success', { videoCount: jobs.length });

    return json({
      videos: jobs.map((job) => ({
        id: job.id,
        productId: job.shopifyProductId,
        templateId: job.templateId,
        status: job.status,
        videoUrl: job.videoUrl,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error('Fetch videos failed', { error: error instanceof Error ? error.message : String(error) });
    reqLog.end('error', { reason: 'exception' });
    throw error;
  }
}
