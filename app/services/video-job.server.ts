import { prisma } from '~/lib/db.server';

export interface CreateVideoJobInput {
  shopId: string;
  shopifyProductId: string;
  sourceImageUrls: string[];
  templateId: string;
}

export async function createVideoJob(input: CreateVideoJobInput) {
  return prisma.videoJob.create({
    data: {
      shopId: input.shopId,
      shopifyProductId: input.shopifyProductId,
      sourceImageUrls: input.sourceImageUrls,
      templateId: input.templateId,
      status: 'queued',
    },
  });
}

export async function updateJobStatus(
  jobId: string,
  status: string,
  data?: { videoUrl?: string; errorMessage?: string }
) {
  return prisma.videoJob.update({
    where: { id: jobId },
    data: {
      status,
      ...data,
    },
  });
}

export async function getJobsByShop(shopId: string) {
  return prisma.videoJob.findMany({
    where: { shopId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getJobById(jobId: string) {
  return prisma.videoJob.findUnique({
    where: { id: jobId },
  });
}
