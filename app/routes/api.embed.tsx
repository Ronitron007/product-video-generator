import { json, ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/lib/db.server';
import { getJobById } from '~/services/video-job.server';

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  const formData = await request.formData();
  const jobId = formData.get('jobId') as string;

  // Get video job
  const job = await getJobById(jobId);
  if (!job || job.status !== 'done' || !job.videoUrl) {
    return json({ error: 'Video not ready' }, { status: 400 });
  }

  // Extract numeric product ID from GID
  const productId = job.shopifyProductId.split('/').pop();

  // Upload video to Shopify
  const response = await admin.graphql(`
    mutation CreateMediaFromUrl($productId: ID!, $mediaUrl: String!) {
      productCreateMedia(
        productId: $productId
        media: [{ originalSource: $mediaUrl, mediaContentType: VIDEO }]
      ) {
        media {
          ... on Video {
            id
          }
        }
        mediaUserErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      productId: job.shopifyProductId,
      mediaUrl: job.videoUrl,
    },
  });

  const data = await response.json();

  if (data.data.productCreateMedia.mediaUserErrors?.length > 0) {
    return json(
      { error: data.data.productCreateMedia.mediaUserErrors[0].message },
      { status: 400 }
    );
  }

  const mediaId = data.data.productCreateMedia.media[0]?.id;

  // Save embed record
  await prisma.productEmbed.create({
    data: {
      videoJobId: jobId,
      shopifyProductId: job.shopifyProductId,
      shopifyMediaId: mediaId,
    },
  });

  return json({ success: true, mediaId });
}
