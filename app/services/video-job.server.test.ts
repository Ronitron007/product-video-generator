import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVideoJob, updateJobStatus, getJobsByShop, getJobById } from './video-job.server';
import { prisma } from '~/lib/db.server';

vi.mock('~/lib/db.server', () => ({
  prisma: {
    videoJob: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe('VideoJob Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a video job', async () => {
    const mockJob = {
      id: 'job1',
      shopId: 'shop1',
      shopifyProductId: 'gid://shopify/Product/123',
      sourceImageUrls: ['url1', 'url2'],
      templateId: 'lifestyle',
      status: 'queued',
    };

    (prisma.videoJob.create as any).mockResolvedValue(mockJob);

    const result = await createVideoJob({
      shopId: 'shop1',
      shopifyProductId: 'gid://shopify/Product/123',
      sourceImageUrls: ['url1', 'url2'],
      templateId: 'lifestyle',
    });

    expect(result.status).toBe('queued');
    expect(result.templateId).toBe('lifestyle');
  });
});

describe('updateJobStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates job status to processing', async () => {
    const mockUpdatedJob = {
      id: 'job1',
      status: 'processing',
    };
    (prisma.videoJob.update as any).mockResolvedValue(mockUpdatedJob);

    const result = await updateJobStatus('job1', 'processing');

    expect(prisma.videoJob.update).toHaveBeenCalledWith({
      where: { id: 'job1' },
      data: { status: 'processing' },
    });
    expect(result.status).toBe('processing');
  });

  it('updates job status to done with videoUrl', async () => {
    const mockUpdatedJob = {
      id: 'job1',
      status: 'done',
      videoUrl: 'https://cdn.example.com/video.mp4',
    };
    (prisma.videoJob.update as any).mockResolvedValue(mockUpdatedJob);

    const result = await updateJobStatus('job1', 'done', {
      videoUrl: 'https://cdn.example.com/video.mp4',
    });

    expect(prisma.videoJob.update).toHaveBeenCalledWith({
      where: { id: 'job1' },
      data: {
        status: 'done',
        videoUrl: 'https://cdn.example.com/video.mp4',
      },
    });
    expect(result.videoUrl).toBe('https://cdn.example.com/video.mp4');
  });

  it('updates job status to failed with errorMessage', async () => {
    const mockUpdatedJob = {
      id: 'job1',
      status: 'failed',
      errorMessage: 'Video generation failed',
    };
    (prisma.videoJob.update as any).mockResolvedValue(mockUpdatedJob);

    const result = await updateJobStatus('job1', 'failed', {
      errorMessage: 'Video generation failed',
    });

    expect(prisma.videoJob.update).toHaveBeenCalledWith({
      where: { id: 'job1' },
      data: {
        status: 'failed',
        errorMessage: 'Video generation failed',
      },
    });
    expect(result.errorMessage).toBe('Video generation failed');
  });
});

describe('getJobsByShop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns jobs for a shop ordered by createdAt desc', async () => {
    const mockJobs = [
      { id: 'job2', shopId: 'shop1', status: 'done', createdAt: new Date('2024-01-02') },
      { id: 'job1', shopId: 'shop1', status: 'queued', createdAt: new Date('2024-01-01') },
    ];
    (prisma.videoJob.findMany as any).mockResolvedValue(mockJobs);

    const result = await getJobsByShop('shop1');

    expect(prisma.videoJob.findMany).toHaveBeenCalledWith({
      where: { shopId: 'shop1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('job2');
  });

  it('returns empty array when shop has no jobs', async () => {
    (prisma.videoJob.findMany as any).mockResolvedValue([]);

    const result = await getJobsByShop('shop-no-jobs');

    expect(result).toHaveLength(0);
  });
});

describe('getJobById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns job by id', async () => {
    const mockJob = { id: 'job1', shopId: 'shop1', status: 'queued' };
    (prisma.videoJob.findUnique as any).mockResolvedValue(mockJob);

    const result = await getJobById('job1');

    expect(prisma.videoJob.findUnique).toHaveBeenCalledWith({
      where: { id: 'job1' },
    });
    expect(result?.id).toBe('job1');
  });
});
