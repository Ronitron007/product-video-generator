import { json, LoaderFunctionArgs } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { getShopByDomain } from '~/services/shop.server';
import { getJobsByShop } from '~/services/video-job.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);

  if (!shop) {
    return json({ error: 'Shop not found' }, { status: 404 });
  }

  const jobs = await getJobsByShop(shop.id);

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
}
