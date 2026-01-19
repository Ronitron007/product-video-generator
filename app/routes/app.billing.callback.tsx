import { LoaderFunctionArgs, redirect } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { getShopByDomain, updateShopPlan } from '~/services/shop.server';
import { prisma } from '~/lib/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const plan = url.searchParams.get('plan');
  const chargeId = url.searchParams.get('charge_id');

  if (!plan || !chargeId) {
    return redirect('/app?error=billing_failed');
  }

  const shop = await getShopByDomain(session.shop);
  if (!shop) {
    return redirect('/app?error=shop_not_found');
  }

  // Update shop plan
  await updateShopPlan(shop.id, plan);

  // Reset video count for new billing cycle
  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      videosUsedThisMonth: 0,
      billingCycleStart: new Date(),
    },
  });

  return redirect('/app?success=upgraded');
}
