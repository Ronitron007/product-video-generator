import { ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/lib/db.server';

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await authenticate.webhook(request);

  // Delete shop and all related data (cascades to VideoJobs and ProductEmbeds)
  await prisma.shop.delete({
    where: { shopifyDomain: shop },
  }).catch(() => {
    // Shop may not exist, ignore
  });

  return new Response(null, { status: 200 });
}
