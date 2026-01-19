import { ActionFunctionArgs, json } from '@remix-run/node';
import { prisma } from '~/lib/db.server';

export async function action({ request }: ActionFunctionArgs) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Reset shops where billing cycle has passed
  const result = await prisma.shop.updateMany({
    where: {
      billingCycleStart: { lte: thirtyDaysAgo },
      plan: { not: 'trial' },
    },
    data: {
      videosUsedThisMonth: 0,
      billingCycleStart: new Date(),
    },
  });

  return json({ reset: result.count });
}

// Also allow GET for Vercel cron
export async function loader({ request }: ActionFunctionArgs) {
  return action({ request } as ActionFunctionArgs);
}
