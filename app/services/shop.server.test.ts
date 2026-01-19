import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOrCreateShop, getShopByDomain, canGenerateVideo, incrementVideosUsed } from './shop.server';
import { prisma } from '~/lib/db.server';

vi.mock('~/lib/db.server', () => ({
  prisma: {
    shop: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('Shop Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates shop if not exists', async () => {
    const mockShop = {
      id: '1',
      shopifyDomain: 'test.myshopify.com',
      accessToken: 'token123',
      plan: 'trial',
      videosUsedThisMonth: 0,
    };

    (prisma.shop.upsert as any).mockResolvedValue(mockShop);

    const result = await getOrCreateShop('test.myshopify.com', 'token123');

    expect(result.shopifyDomain).toBe('test.myshopify.com');
    expect(result.plan).toBe('trial');
  });
});

describe('canGenerateVideo', () => {
  it('trial plan with 0 videos used → true', () => {
    expect(canGenerateVideo({ plan: 'trial', videosUsedThisMonth: 0 })).toBe(true);
  });

  it('trial plan with 1 video used → false', () => {
    expect(canGenerateVideo({ plan: 'trial', videosUsedThisMonth: 1 })).toBe(false);
  });

  it('basic plan with 19 videos used → true', () => {
    expect(canGenerateVideo({ plan: 'basic', videosUsedThisMonth: 19 })).toBe(true);
  });

  it('basic plan with 20 videos used → false', () => {
    expect(canGenerateVideo({ plan: 'basic', videosUsedThisMonth: 20 })).toBe(false);
  });

  it('unknown plan → false', () => {
    expect(canGenerateVideo({ plan: 'unknown', videosUsedThisMonth: 0 })).toBe(false);
  });
});

describe('incrementVideosUsed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls prisma.shop.update with correct params', async () => {
    const mockUpdatedShop = {
      id: 'shop-123',
      videosUsedThisMonth: 1,
    };
    (prisma.shop.update as any).mockResolvedValue(mockUpdatedShop);

    await incrementVideosUsed('shop-123');

    expect(prisma.shop.update).toHaveBeenCalledWith({
      where: { id: 'shop-123' },
      data: { videosUsedThisMonth: { increment: 1 } },
    });
  });
});
