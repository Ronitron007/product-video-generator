import { Client } from '@upstash/qstash';

const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
});

export interface VideoJobData {
  jobId: string;
  shopId: string;
  sourceImageUrls: string[];
  templateId: string;
}

export async function addVideoJob(data: VideoJobData) {
  const baseUrl = process.env.SHOPIFY_APP_URL || process.env.VERCEL_URL;
  const endpoint = `${baseUrl}/api/process-video`;

  return qstash.publishJSON({
    url: endpoint,
    body: data,
    retries: 3,
  });
}
