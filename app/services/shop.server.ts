import { prisma } from '~/lib/db.server';

export async function getOrCreateShop(shopifyDomain: string, accessToken: string) {
  return prisma.shop.upsert({
    where: { shopifyDomain },
    update: { accessToken },
    create: {
      shopifyDomain,
      accessToken,
      plan: 'trial',
      videosUsedThisMonth: 0,
    },
  });
}

export async function getShopByDomain(shopifyDomain: string) {
  return prisma.shop.findUnique({
    where: { shopifyDomain },
  });
}

export async function incrementVideosUsed(shopId: string) {
  return prisma.shop.update({
    where: { id: shopId },
    data: {
      videosUsedThisMonth: { increment: 1 },
    },
  });
}

export async function updateShopPlan(shopId: string, plan: string) {
  return prisma.shop.update({
    where: { id: shopId },
    data: { plan },
  });
}

export const PLAN_LIMITS = {
  trial: 1,
  basic: 20,
  pro: 100,
} as const;

export function canGenerateVideo(shop: { plan: string; videosUsedThisMonth: number }) {
  const limit = PLAN_LIMITS[shop.plan as keyof typeof PLAN_LIMITS] ?? 0;
  return shop.videosUsedThisMonth < limit;
}
