import { json, ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { getOrCreateShop, canGenerateVideo } from '~/services/shop.server';
import { createVideoJob } from '~/services/video-job.server';
import { addVideoJob } from '~/lib/queue.server';

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || '');

  // Check plan limits
  if (!canGenerateVideo(shop)) {
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
    return json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (imageUrls.length > 3) {
    return json({ error: 'Maximum 3 images allowed' }, { status: 400 });
  }

  // Create job in database
  const videoJob = await createVideoJob({
    shopId: shop.id,
    shopifyProductId: productId,
    sourceImageUrls: imageUrls,
    templateId,
  });

  // Add to queue
  await addVideoJob({
    jobId: videoJob.id,
    shopId: shop.id,
    sourceImageUrls: imageUrls,
    templateId,
  });

  return json({ success: true, jobId: videoJob.id });
}
