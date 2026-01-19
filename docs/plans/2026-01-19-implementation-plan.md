# Shopify Product Video Generator - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Shopify app that generates product videos from images using Veo 3.1 with subscription billing.

**Architecture:** Next.js embedded Shopify app with PostgreSQL for data, Redis/BullMQ for async video generation queue, Cloudflare R2 for video storage.

**Tech Stack:** Next.js 14, Prisma, PostgreSQL (Neon), Redis (Upstash), BullMQ, Shopify App Bridge, Polaris, Google Veo 3.1 API

**Design Doc:** `docs/plans/2026-01-19-shopify-veo-video-app-design.md`

---

## Phase 1: Project Setup

### Task 1.1: Scaffold Shopify Next.js App

**Files:**
- Create: entire project structure via Shopify CLI

**Step 1: Create Shopify app using CLI**

Run:
```bash
npm init @shopify/app@latest -- --template https://github.com/Shopify/shopify-app-template-remix
```

When prompted:
- App name: `product-video-generator`
- Use this existing directory: Yes

Note: We use Remix template then convert key parts to Next.js patterns, OR use community Next.js template. For faster setup, we'll use the official template and adapt.

**Step 2: Verify app runs**

Run:
```bash
cd product-video-generator
npm install
npm run dev
```

Expected: App starts, Shopify CLI provides tunnel URL

**Step 3: Commit**

```bash
git add .
git commit -m "chore: scaffold Shopify app from template"
```

---

### Task 1.2: Set Up PostgreSQL with Prisma

**Files:**
- Create: `prisma/schema.prisma`
- Modify: `package.json` (add prisma deps)
- Create: `.env` (add DATABASE_URL)

**Step 1: Install Prisma**

Run:
```bash
npm install prisma @prisma/client
npx prisma init
```

**Step 2: Configure schema**

Write to `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Shop {
  id                   String     @id @default(cuid())
  shopifyDomain        String     @unique
  accessToken          String
  plan                 String     @default("trial")
  videosUsedThisMonth  Int        @default(0)
  billingCycleStart    DateTime   @default(now())
  createdAt            DateTime   @default(now())
  updatedAt            DateTime   @updatedAt
  videoJobs            VideoJob[]
}

model VideoJob {
  id                String         @id @default(cuid())
  shopId            String
  shop              Shop           @relation(fields: [shopId], references: [id], onDelete: Cascade)
  shopifyProductId  String
  sourceImageUrls   String[]
  templateId        String
  status            String         @default("queued")
  videoUrl          String?
  errorMessage      String?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
  embeds            ProductEmbed[]
}

model ProductEmbed {
  id               String   @id @default(cuid())
  videoJobId       String
  videoJob         VideoJob @relation(fields: [videoJobId], references: [id], onDelete: Cascade)
  shopifyProductId String
  shopifyMediaId   String
  createdAt        DateTime @default(now())
}
```

**Step 3: Add DATABASE_URL to .env**

```
DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require"
```

Note: Get this from Neon dashboard after creating project.

**Step 4: Generate Prisma client**

Run:
```bash
npx prisma generate
```

Expected: Prisma Client generated

**Step 5: Push schema to database**

Run:
```bash
npx prisma db push
```

Expected: Database synced with schema

**Step 6: Commit**

```bash
git add prisma/ .env.example
git commit -m "feat: add Prisma schema for Shop, VideoJob, ProductEmbed"
```

---

### Task 1.3: Set Up Redis with BullMQ

**Files:**
- Create: `app/lib/queue.server.ts`
- Modify: `.env` (add REDIS_URL)

**Step 1: Install BullMQ**

Run:
```bash
npm install bullmq ioredis
```

**Step 2: Create queue configuration**

Create `app/lib/queue.server.ts`:
```typescript
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export const videoQueue = new Queue('video-generation', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export interface VideoJobData {
  jobId: string;
  shopId: string;
  sourceImageUrls: string[];
  templateId: string;
}

export async function addVideoJob(data: VideoJobData) {
  return videoQueue.add('generate', data);
}
```

**Step 3: Add REDIS_URL to .env**

```
REDIS_URL="rediss://default:xxx@xxx.upstash.io:6379"
```

Note: Get from Upstash dashboard.

**Step 4: Commit**

```bash
git add app/lib/queue.server.ts
git commit -m "feat: add BullMQ queue for video generation"
```

---

## Phase 2: Core Data Layer

### Task 2.1: Create Prisma Client Singleton

**Files:**
- Create: `app/lib/db.server.ts`

**Step 1: Create database client**

Create `app/lib/db.server.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

declare global {
  var __db__: PrismaClient | undefined;
}

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.__db__) {
    global.__db__ = new PrismaClient();
  }
  prisma = global.__db__;
}

export { prisma };
```

**Step 2: Commit**

```bash
git add app/lib/db.server.ts
git commit -m "feat: add Prisma client singleton"
```

---

### Task 2.2: Create Shop Service

**Files:**
- Create: `app/services/shop.server.ts`
- Create: `app/services/shop.server.test.ts`

**Step 1: Write failing test**

Create `app/services/shop.server.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOrCreateShop, getShopByDomain } from './shop.server';
import { prisma } from '~/lib/db.server';

vi.mock('~/lib/db.server', () => ({
  prisma: {
    shop: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
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
```

**Step 2: Run test to verify it fails**

Run:
```bash
npm test -- app/services/shop.server.test.ts
```

Expected: FAIL - module not found

**Step 3: Write implementation**

Create `app/services/shop.server.ts`:
```typescript
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
```

**Step 4: Run test to verify it passes**

Run:
```bash
npm test -- app/services/shop.server.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add app/services/shop.server.ts app/services/shop.server.test.ts
git commit -m "feat: add shop service with plan limits"
```

---

### Task 2.3: Create VideoJob Service

**Files:**
- Create: `app/services/video-job.server.ts`
- Create: `app/services/video-job.server.test.ts`

**Step 1: Write failing test**

Create `app/services/video-job.server.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVideoJob, updateJobStatus } from './video-job.server';
import { prisma } from '~/lib/db.server';

vi.mock('~/lib/db.server', () => ({
  prisma: {
    videoJob: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
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
```

**Step 2: Run test to verify it fails**

Run:
```bash
npm test -- app/services/video-job.server.test.ts
```

Expected: FAIL

**Step 3: Write implementation**

Create `app/services/video-job.server.ts`:
```typescript
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
```

**Step 4: Run test to verify it passes**

Run:
```bash
npm test -- app/services/video-job.server.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add app/services/video-job.server.ts app/services/video-job.server.test.ts
git commit -m "feat: add video job service"
```

---

## Phase 3: Video Generation Pipeline

### Task 3.1: Create Video Templates Config

**Files:**
- Create: `app/config/templates.ts`

**Step 1: Create templates config**

Create `app/config/templates.ts`:
```typescript
export interface VideoTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  duration: number;
  thumbnail: string;
}

export const TEMPLATES: Record<string, VideoTemplate> = {
  'zoom-pan': {
    id: 'zoom-pan',
    name: 'Cinematic Zoom',
    description: 'Slow cinematic zoom with subtle movement',
    prompt: 'Slow cinematic zoom on the product, subtle camera movement, professional product photography lighting, clean background',
    duration: 4,
    thumbnail: '/templates/zoom-pan.jpg',
  },
  'lifestyle': {
    id: 'lifestyle',
    name: 'Lifestyle Scene',
    description: 'Product in a lifestyle context',
    prompt: 'Product shown in elegant lifestyle setting, natural lighting, gentle ambient movement, aspirational context',
    duration: 6,
    thumbnail: '/templates/lifestyle.jpg',
  },
  '360-spin': {
    id: '360-spin',
    name: '360° Spin',
    description: 'Product rotating 360 degrees',
    prompt: 'Product smoothly rotating 360 degrees on clean background, professional studio lighting, seamless loop',
    duration: 5,
    thumbnail: '/templates/360-spin.jpg',
  },
};

export function getTemplate(id: string): VideoTemplate | undefined {
  return TEMPLATES[id];
}

export function getAllTemplates(): VideoTemplate[] {
  return Object.values(TEMPLATES);
}
```

**Step 2: Commit**

```bash
git add app/config/templates.ts
git commit -m "feat: add video template configurations"
```

---

### Task 3.2: Create Veo 3.1 Client

**Files:**
- Create: `app/lib/veo.server.ts`
- Modify: `.env` (add GOOGLE_API_KEY)

**Step 1: Install Google AI SDK**

Run:
```bash
npm install @google/generative-ai
```

**Step 2: Create Veo client**

Create `app/lib/veo.server.ts`:
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export interface GenerateVideoInput {
  prompt: string;
  referenceImageUrls: string[];
  duration: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

export interface GenerateVideoResult {
  operationId: string;
}

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  // Fetch images and convert to base64
  const imageBuffers = await Promise.all(
    input.referenceImageUrls.map(async (url) => {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer).toString('base64');
    })
  );

  const model = genAI.getGenerativeModel({ model: 'veo-3.1' });

  // Build reference images array
  const referenceImages = imageBuffers.map((base64, i) => ({
    inlineData: {
      mimeType: 'image/jpeg',
      data: base64,
    },
  }));

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          ...referenceImages,
          { text: input.prompt },
        ],
      },
    ],
    generationConfig: {
      // @ts-ignore - Veo specific config
      videoDuration: input.duration,
      aspectRatio: input.aspectRatio || '16:9',
    },
  });

  // Return operation ID for polling
  // Note: Actual API may differ - adjust based on Veo 3.1 docs
  return {
    operationId: (result as any).operationId || result.response.text(),
  };
}

export async function pollVideoStatus(operationId: string): Promise<{
  done: boolean;
  videoUrl?: string;
  error?: string;
}> {
  // Poll the operation status
  // Note: Implement based on actual Veo 3.1 API
  const model = genAI.getGenerativeModel({ model: 'veo-3.1' });

  // Placeholder - actual implementation depends on Veo API
  const result = await (model as any).getOperation(operationId);

  if (result.done) {
    return {
      done: true,
      videoUrl: result.response?.videoUrl,
    };
  }

  if (result.error) {
    return {
      done: true,
      error: result.error.message,
    };
  }

  return { done: false };
}
```

**Step 3: Add to .env**

```
GOOGLE_API_KEY="your-google-api-key"
```

**Step 4: Commit**

```bash
git add app/lib/veo.server.ts
git commit -m "feat: add Veo 3.1 client for video generation"
```

---

### Task 3.3: Create Video Worker

**Files:**
- Create: `app/workers/video.worker.ts`

**Step 1: Create worker**

Create `app/workers/video.worker.ts`:
```typescript
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '~/lib/db.server';
import { generateVideo, pollVideoStatus } from '~/lib/veo.server';
import { getTemplate } from '~/config/templates';
import { updateJobStatus } from '~/services/video-job.server';
import { incrementVideosUsed } from '~/services/shop.server';

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export interface VideoJobData {
  jobId: string;
  shopId: string;
  sourceImageUrls: string[];
  templateId: string;
}

async function processVideoJob(job: Job<VideoJobData>) {
  const { jobId, shopId, sourceImageUrls, templateId } = job.data;

  try {
    // Update status to processing
    await updateJobStatus(jobId, 'processing');

    // Get template
    const template = getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Generate video
    const { operationId } = await generateVideo({
      prompt: template.prompt,
      referenceImageUrls: sourceImageUrls,
      duration: template.duration,
    });

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5s intervals

    while (attempts < maxAttempts) {
      const status = await pollVideoStatus(operationId);

      if (status.done) {
        if (status.error) {
          throw new Error(status.error);
        }

        // Success - update job with video URL
        await updateJobStatus(jobId, 'done', { videoUrl: status.videoUrl });
        await incrementVideosUsed(shopId);
        return { success: true, videoUrl: status.videoUrl };
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error('Video generation timed out');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateJobStatus(jobId, 'failed', { errorMessage });
    throw error;
  }
}

export function startVideoWorker() {
  const worker = new Worker('video-generation', processVideoJob, {
    connection,
    concurrency: 2,
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  return worker;
}
```

**Step 2: Commit**

```bash
git add app/workers/video.worker.ts
git commit -m "feat: add video generation worker"
```

---

### Task 3.4: Create R2 Storage Client

**Files:**
- Create: `app/lib/storage.server.ts`
- Modify: `.env` (add R2 credentials)

**Step 1: Install S3 client**

Run:
```bash
npm install @aws-sdk/client-s3
```

**Step 2: Create storage client**

Create `app/lib/storage.server.ts`:
```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;

export async function uploadVideo(
  key: string,
  videoBuffer: Buffer,
  contentType = 'video/mp4'
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: videoBuffer,
      ContentType: contentType,
    })
  );

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

export async function getSignedVideoUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

export async function uploadVideoFromUrl(key: string, videoUrl: string): Promise<string> {
  const response = await fetch(videoUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  return uploadVideo(key, buffer);
}
```

**Step 3: Add to .env**

```
R2_ENDPOINT="https://xxx.r2.cloudflarestorage.com"
R2_ACCESS_KEY_ID="your-access-key"
R2_SECRET_ACCESS_KEY="your-secret-key"
R2_BUCKET_NAME="product-videos"
R2_PUBLIC_URL="https://your-bucket.r2.dev"
```

**Step 4: Commit**

```bash
git add app/lib/storage.server.ts
git commit -m "feat: add Cloudflare R2 storage client"
```

---

## Phase 4: API Routes

### Task 4.1: Create Products API Route

**Files:**
- Create: `app/routes/api.products.tsx`

**Step 1: Create products route**

Create `app/routes/api.products.tsx`:
```typescript
import { json, LoaderFunctionArgs } from '@remix-run/node';
import { authenticate } from '~/shopify.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query GetProducts($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        edges {
          node {
            id
            title
            handle
            images(first: 10) {
              edges {
                node {
                  id
                  url
                  altText
                }
              }
            }
            featuredImage {
              url
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `, {
    variables: {
      first: 20,
      after: new URL(request.url).searchParams.get('after') || null,
    },
  });

  const data = await response.json();

  return json({
    products: data.data.products.edges.map((edge: any) => ({
      id: edge.node.id,
      title: edge.node.title,
      handle: edge.node.handle,
      images: edge.node.images.edges.map((img: any) => ({
        id: img.node.id,
        url: img.node.url,
        altText: img.node.altText,
      })),
      featuredImage: edge.node.featuredImage?.url,
      cursor: edge.cursor,
    })),
    hasNextPage: data.data.products.pageInfo.hasNextPage,
  });
}
```

**Step 2: Commit**

```bash
git add app/routes/api.products.tsx
git commit -m "feat: add products API route"
```

---

### Task 4.2: Create Generate Video API Route

**Files:**
- Create: `app/routes/api.generate.tsx`

**Step 1: Create generate route**

Create `app/routes/api.generate.tsx`:
```typescript
import { json, ActionFunctionArgs } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { getShopByDomain, canGenerateVideo } from '~/services/shop.server';
import { createVideoJob } from '~/services/video-job.server';
import { addVideoJob } from '~/lib/queue.server';

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);

  if (!shop) {
    return json({ error: 'Shop not found' }, { status: 404 });
  }

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
```

**Step 2: Commit**

```bash
git add app/routes/api.generate.tsx
git commit -m "feat: add generate video API route"
```

---

### Task 4.3: Create Videos List API Route

**Files:**
- Create: `app/routes/api.videos.tsx`

**Step 1: Create videos route**

Create `app/routes/api.videos.tsx`:
```typescript
import { json, LoaderFunctionArgs } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { getShopByDomain } from '~/services/shop.server';
import { getJobsByShop } from '~/services/video-job.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);

  if (!shop) {
    return json({ error: 'Shop not found' }, { status: 404 });
  }

  const jobs = await getJobsByShop(shop.id);

  return json({
    videos: jobs.map((job) => ({
      id: job.id,
      productId: job.shopifyProductId,
      templateId: job.templateId,
      status: job.status,
      videoUrl: job.videoUrl,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt.toISOString(),
    })),
  });
}
```

**Step 2: Commit**

```bash
git add app/routes/api.videos.tsx
git commit -m "feat: add videos list API route"
```

---

### Task 4.4: Create Embed Video API Route

**Files:**
- Create: `app/routes/api.embed.tsx`

**Step 1: Create embed route**

Create `app/routes/api.embed.tsx`:
```typescript
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
```

**Step 2: Commit**

```bash
git add app/routes/api.embed.tsx
git commit -m "feat: add embed video API route"
```

---

## Phase 5: UI Components

### Task 5.1: Create Dashboard Page

**Files:**
- Modify: `app/routes/app._index.tsx`

**Step 1: Update dashboard**

Replace `app/routes/app._index.tsx`:
```typescript
import { json, LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  ProgressBar,
  Thumbnail,
  Badge,
} from '@shopify/polaris';
import { authenticate } from '~/shopify.server';
import { getShopByDomain, PLAN_LIMITS } from '~/services/shop.server';
import { getJobsByShop } from '~/services/video-job.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);

  if (!shop) {
    return json({ shop: null, recentVideos: [] });
  }

  const jobs = await getJobsByShop(shop.id);
  const recentVideos = jobs.slice(0, 6);

  return json({
    shop: {
      plan: shop.plan,
      videosUsed: shop.videosUsedThisMonth,
      videosLimit: PLAN_LIMITS[shop.plan as keyof typeof PLAN_LIMITS],
    },
    recentVideos,
  });
}

export default function Dashboard() {
  const { shop, recentVideos } = useLoaderData<typeof loader>();

  const usagePercent = shop ? (shop.videosUsed / shop.videosLimit) * 100 : 0;

  return (
    <Page title="Product Video Generator">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Videos this month
                  </Text>
                  <Text as="p" variant="bodyLg">
                    {shop?.videosUsed ?? 0} / {shop?.videosLimit ?? 1}
                  </Text>
                </BlockStack>
                <Button variant="primary" url="/app/create">
                  Create Video
                </Button>
              </InlineStack>
              <ProgressBar progress={usagePercent} size="small" />
              {shop?.plan === 'trial' && shop.videosUsed >= 1 && (
                <Button url="/app/upgrade">Upgrade to continue</Button>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  Recent Videos
                </Text>
                <Link to="/app/videos">View all</Link>
              </InlineStack>

              {recentVideos.length === 0 ? (
                <Text as="p" tone="subdued">
                  No videos yet. Create your first video!
                </Text>
              ) : (
                <InlineStack gap="400" wrap>
                  {recentVideos.map((video: any) => (
                    <Link key={video.id} to={`/app/videos/${video.id}`}>
                      <Card>
                        <BlockStack gap="200">
                          <Thumbnail
                            source={video.videoUrl || '/placeholder.jpg'}
                            alt={video.templateId}
                            size="large"
                          />
                          <Badge
                            tone={
                              video.status === 'done'
                                ? 'success'
                                : video.status === 'failed'
                                ? 'critical'
                                : 'info'
                            }
                          >
                            {video.status}
                          </Badge>
                        </BlockStack>
                      </Card>
                    </Link>
                  ))}
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

**Step 2: Commit**

```bash
git add app/routes/app._index.tsx
git commit -m "feat: add dashboard page with usage stats"
```

---

### Task 5.2: Create Product Picker Page

**Files:**
- Create: `app/routes/app.create.tsx`

**Step 1: Create create page**

Create `app/routes/app.create.tsx`:
```typescript
import { useState, useCallback } from 'react';
import { json, LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useFetcher, useNavigate } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  ResourceList,
  ResourceItem,
  Thumbnail,
  Checkbox,
  ChoiceList,
  Banner,
} from '@shopify/polaris';
import { authenticate } from '~/shopify.server';
import { getAllTemplates } from '~/config/templates';

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return json({ templates: getAllTemplates() });
}

type Step = 'product' | 'images' | 'template';

export default function CreateVideo() {
  const { templates } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('product');
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Load products
  const loadProducts = useCallback(async () => {
    setLoading(true);
    const response = await fetch('/api/products');
    const data = await response.json();
    setProducts(data.products);
    setLoading(false);
  }, []);

  // Initial load
  useState(() => {
    loadProducts();
  });

  const handleProductSelect = (product: any) => {
    setSelectedProduct(product);
    setStep('images');
  };

  const handleImageToggle = (url: string) => {
    setSelectedImages((prev) =>
      prev.includes(url)
        ? prev.filter((u) => u !== url)
        : prev.length < 3
        ? [...prev, url]
        : prev
    );
  };

  const handleGenerate = async () => {
    const formData = new FormData();
    formData.append('productId', selectedProduct.id);
    formData.append('imageUrls', JSON.stringify(selectedImages));
    formData.append('templateId', selectedTemplate);

    fetcher.submit(formData, { method: 'POST', action: '/api/generate' });
  };

  // Handle success
  if (fetcher.data?.success) {
    navigate('/app/videos');
  }

  return (
    <Page
      title="Create Video"
      backAction={{ content: 'Dashboard', url: '/app' }}
    >
      <Layout>
        {fetcher.data?.error && (
          <Layout.Section>
            <Banner tone="critical">
              {fetcher.data.upgradeRequired
                ? 'You have reached your video limit. Upgrade to continue.'
                : fetcher.data.error}
            </Banner>
          </Layout.Section>
        )}

        {step === 'product' && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Step 1: Select a Product
                </Text>
                <ResourceList
                  loading={loading}
                  items={products}
                  renderItem={(product) => (
                    <ResourceItem
                      id={product.id}
                      onClick={() => handleProductSelect(product)}
                      media={
                        <Thumbnail
                          source={product.featuredImage || '/placeholder.jpg'}
                          alt={product.title}
                        />
                      }
                    >
                      <Text as="p" variant="bodyMd" fontWeight="bold">
                        {product.title}
                      </Text>
                      <Text as="p" tone="subdued">
                        {product.images.length} images
                      </Text>
                    </ResourceItem>
                  )}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {step === 'images' && selectedProduct && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Step 2: Select Images (1-3)
                  </Text>
                  <Button onClick={() => setStep('product')}>Back</Button>
                </InlineStack>
                <Text as="p" tone="subdued">
                  Selected: {selectedImages.length}/3
                </Text>
                <InlineStack gap="400" wrap>
                  {selectedProduct.images.map((image: any) => (
                    <div
                      key={image.id}
                      onClick={() => handleImageToggle(image.url)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Card>
                        <BlockStack gap="200">
                          <Thumbnail
                            source={image.url}
                            alt={image.altText || 'Product image'}
                            size="large"
                          />
                          <Checkbox
                            label=""
                            checked={selectedImages.includes(image.url)}
                            onChange={() => handleImageToggle(image.url)}
                          />
                        </BlockStack>
                      </Card>
                    </div>
                  ))}
                </InlineStack>
                <Button
                  variant="primary"
                  disabled={selectedImages.length === 0}
                  onClick={() => setStep('template')}
                >
                  Next: Choose Template
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {step === 'template' && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Step 3: Choose Template
                  </Text>
                  <Button onClick={() => setStep('images')}>Back</Button>
                </InlineStack>
                <ChoiceList
                  title=""
                  choices={templates.map((t) => ({
                    label: t.name,
                    value: t.id,
                    helpText: t.description,
                  }))}
                  selected={selectedTemplate ? [selectedTemplate] : []}
                  onChange={(value) => setSelectedTemplate(value[0])}
                />
                <Button
                  variant="primary"
                  disabled={!selectedTemplate}
                  loading={fetcher.state === 'submitting'}
                  onClick={handleGenerate}
                >
                  Generate Video
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
```

**Step 2: Commit**

```bash
git add app/routes/app.create.tsx
git commit -m "feat: add create video flow with product/image/template selection"
```

---

### Task 5.3: Create Videos List Page

**Files:**
- Create: `app/routes/app.videos.tsx`

**Step 1: Create videos page**

Create `app/routes/app.videos.tsx`:
```typescript
import { json, LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  EmptyState,
  IndexTable,
} from '@shopify/polaris';
import { authenticate } from '~/shopify.server';
import { getShopByDomain } from '~/services/shop.server';
import { getJobsByShop } from '~/services/video-job.server';
import { getTemplate } from '~/config/templates';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);

  if (!shop) {
    return json({ videos: [] });
  }

  const jobs = await getJobsByShop(shop.id);
  return json({ videos: jobs });
}

export default function Videos() {
  const { videos } = useLoaderData<typeof loader>();

  const statusBadge = (status: string) => {
    const tones: Record<string, 'success' | 'critical' | 'info' | 'warning'> = {
      done: 'success',
      failed: 'critical',
      processing: 'info',
      queued: 'warning',
    };
    return <Badge tone={tones[status] || 'info'}>{status}</Badge>;
  };

  return (
    <Page
      title="My Videos"
      backAction={{ content: 'Dashboard', url: '/app' }}
      primaryAction={{ content: 'Create Video', url: '/app/create' }}
    >
      <Layout>
        <Layout.Section>
          {videos.length === 0 ? (
            <Card>
              <EmptyState
                heading="No videos yet"
                action={{ content: 'Create Video', url: '/app/create' }}
                image="/empty-state.svg"
              >
                <p>Generate your first product video to get started.</p>
              </EmptyState>
            </Card>
          ) : (
            <Card>
              <IndexTable
                itemCount={videos.length}
                headings={[
                  { title: 'Template' },
                  { title: 'Status' },
                  { title: 'Created' },
                  { title: 'Actions' },
                ]}
                selectable={false}
              >
                {videos.map((video: any, index: number) => {
                  const template = getTemplate(video.templateId);
                  return (
                    <IndexTable.Row key={video.id} id={video.id} position={index}>
                      <IndexTable.Cell>
                        <Text as="span" fontWeight="bold">
                          {template?.name || video.templateId}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{statusBadge(video.status)}</IndexTable.Cell>
                      <IndexTable.Cell>
                        {new Date(video.createdAt).toLocaleDateString()}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Link to={`/app/videos/${video.id}`}>View</Link>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

**Step 2: Commit**

```bash
git add app/routes/app.videos.tsx
git commit -m "feat: add videos list page"
```

---

### Task 5.4: Create Video Detail Page

**Files:**
- Create: `app/routes/app.videos.$id.tsx`

**Step 1: Create video detail page**

Create `app/routes/app.videos.$id.tsx`:
```typescript
import { json, LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Badge,
  Banner,
  VideoThumbnail,
} from '@shopify/polaris';
import { authenticate } from '~/shopify.server';
import { getJobById } from '~/services/video-job.server';
import { getTemplate } from '~/config/templates';

export async function loader({ params, request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  const job = await getJobById(params.id!);
  if (!job) {
    throw new Response('Not found', { status: 404 });
  }

  return json({ video: job });
}

export default function VideoDetail() {
  const { video } = useLoaderData<typeof loader>();
  const embedFetcher = useFetcher();

  const template = getTemplate(video.templateId);

  const handleEmbed = () => {
    const formData = new FormData();
    formData.append('jobId', video.id);
    embedFetcher.submit(formData, { method: 'POST', action: '/api/embed' });
  };

  const handleDownload = () => {
    if (video.videoUrl) {
      window.open(video.videoUrl, '_blank');
    }
  };

  return (
    <Page
      title={template?.name || 'Video'}
      backAction={{ content: 'My Videos', url: '/app/videos' }}
    >
      <Layout>
        {embedFetcher.data?.success && (
          <Layout.Section>
            <Banner tone="success">
              Video added to product page successfully!
            </Banner>
          </Layout.Section>
        )}

        {embedFetcher.data?.error && (
          <Layout.Section>
            <Banner tone="critical">{embedFetcher.data.error}</Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingLg">
                    {template?.name}
                  </Text>
                  <Badge
                    tone={
                      video.status === 'done'
                        ? 'success'
                        : video.status === 'failed'
                        ? 'critical'
                        : 'info'
                    }
                  >
                    {video.status}
                  </Badge>
                </BlockStack>
              </InlineStack>

              {video.status === 'done' && video.videoUrl && (
                <>
                  <video
                    src={video.videoUrl}
                    controls
                    style={{ width: '100%', maxWidth: 600 }}
                  />
                  <InlineStack gap="300">
                    <Button onClick={handleDownload}>Download</Button>
                    <Button
                      variant="primary"
                      onClick={handleEmbed}
                      loading={embedFetcher.state === 'submitting'}
                    >
                      Add to Product Page
                    </Button>
                  </InlineStack>
                </>
              )}

              {video.status === 'processing' && (
                <Text as="p" tone="subdued">
                  Your video is being generated. This may take a few minutes.
                </Text>
              )}

              {video.status === 'queued' && (
                <Text as="p" tone="subdued">
                  Your video is in the queue and will start processing soon.
                </Text>
              )}

              {video.status === 'failed' && (
                <Banner tone="critical">
                  Video generation failed: {video.errorMessage || 'Unknown error'}
                </Banner>
              )}

              <BlockStack gap="200">
                <Text as="p" tone="subdued">
                  Created: {new Date(video.createdAt).toLocaleString()}
                </Text>
                <Text as="p" tone="subdued">
                  Images used: {video.sourceImageUrls.length}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

**Step 2: Commit**

```bash
git add app/routes/app.videos.\$id.tsx
git commit -m "feat: add video detail page with download and embed"
```

---

## Phase 6: Billing Integration

### Task 6.1: Create Upgrade Page

**Files:**
- Create: `app/routes/app.upgrade.tsx`

**Step 1: Create upgrade page**

Create `app/routes/app.upgrade.tsx`:
```typescript
import { json, LoaderFunctionArgs, ActionFunctionArgs, redirect } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  List,
  Badge,
} from '@shopify/polaris';
import { authenticate } from '~/shopify.server';
import { getShopByDomain } from '~/services/shop.server';

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: 19,
    videos: 20,
    features: ['20 videos/month', 'All templates', 'Download videos', 'One-click embed'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    videos: 100,
    features: ['100 videos/month', 'All templates', 'Download videos', 'One-click embed', 'Priority processing'],
    recommended: true,
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);

  return json({
    currentPlan: shop?.plan || 'trial',
    plans: PLANS,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  const formData = await request.formData();
  const planId = formData.get('planId') as string;
  const plan = PLANS.find((p) => p.id === planId);

  if (!plan) {
    return json({ error: 'Invalid plan' }, { status: 400 });
  }

  // Create Shopify billing charge
  const response = await admin.graphql(`
    mutation CreateSubscription($name: String!, $price: Decimal!, $returnUrl: URL!) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: $price, currencyCode: USD }
              }
            }
          }
        ]
      ) {
        appSubscription {
          id
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      name: `Product Video Generator - ${plan.name}`,
      price: plan.price.toFixed(2),
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/callback?plan=${planId}`,
    },
  });

  const data = await response.json();

  if (data.data.appSubscriptionCreate.userErrors?.length > 0) {
    return json(
      { error: data.data.appSubscriptionCreate.userErrors[0].message },
      { status: 400 }
    );
  }

  return redirect(data.data.appSubscriptionCreate.confirmationUrl);
}

export default function Upgrade() {
  const { currentPlan, plans } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  return (
    <Page title="Upgrade Plan" backAction={{ content: 'Dashboard', url: '/app' }}>
      <Layout>
        <Layout.Section>
          <InlineStack gap="400" align="center">
            {plans.map((plan) => (
              <Card key={plan.id}>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingLg">
                      {plan.name}
                    </Text>
                    {plan.recommended && <Badge tone="success">Recommended</Badge>}
                  </InlineStack>

                  <Text as="p" variant="heading2xl">
                    ${plan.price}
                    <Text as="span" variant="bodyMd" tone="subdued">
                      /month
                    </Text>
                  </Text>

                  <List>
                    {plan.features.map((feature) => (
                      <List.Item key={feature}>{feature}</List.Item>
                    ))}
                  </List>

                  <fetcher.Form method="POST">
                    <input type="hidden" name="planId" value={plan.id} />
                    <Button
                      variant="primary"
                      submit
                      disabled={currentPlan === plan.id}
                      loading={fetcher.state === 'submitting'}
                      fullWidth
                    >
                      {currentPlan === plan.id ? 'Current Plan' : `Upgrade to ${plan.name}`}
                    </Button>
                  </fetcher.Form>
                </BlockStack>
              </Card>
            ))}
          </InlineStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

**Step 2: Commit**

```bash
git add app/routes/app.upgrade.tsx
git commit -m "feat: add upgrade page with Shopify billing"
```

---

### Task 6.2: Create Billing Callback Route

**Files:**
- Create: `app/routes/app.billing.callback.tsx`

**Step 1: Create callback route**

Create `app/routes/app.billing.callback.tsx`:
```typescript
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
```

**Step 2: Commit**

```bash
git add app/routes/app.billing.callback.tsx
git commit -m "feat: add billing callback to activate subscription"
```

---

## Phase 7: Webhooks

### Task 7.1: Create App Uninstalled Webhook

**Files:**
- Create: `app/routes/webhooks.app.uninstalled.tsx`

**Step 1: Create webhook handler**

Create `app/routes/webhooks.app.uninstalled.tsx`:
```typescript
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
```

**Step 2: Commit**

```bash
git add app/routes/webhooks.app.uninstalled.tsx
git commit -m "feat: add app uninstalled webhook handler"
```

---

### Task 7.2: Register Webhooks in shopify.server.ts

**Files:**
- Modify: `app/shopify.server.ts`

**Step 1: Add webhook registration**

Add to `app/shopify.server.ts` webhooks config:
```typescript
webhooks: {
  APP_UNINSTALLED: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: '/webhooks/app/uninstalled',
  },
},
```

**Step 2: Commit**

```bash
git add app/shopify.server.ts
git commit -m "feat: register app uninstalled webhook"
```

---

## Phase 8: Final Setup

### Task 8.1: Create Environment Example File

**Files:**
- Create: `.env.example`

**Step 1: Create .env.example**

Create `.env.example`:
```
# Shopify
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=
SCOPES=read_products,write_products,read_files,write_files

# Database
DATABASE_URL=

# Redis
REDIS_URL=

# Google Veo
GOOGLE_API_KEY=

# Cloudflare R2
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add environment variables example"
```

---

### Task 8.2: Update .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Ensure .env is ignored**

Add to `.gitignore` if not present:
```
.env
.env.local
node_modules/
.vercel/
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: update gitignore"
```

---

### Task 8.3: Create Vercel Configuration

**Files:**
- Create: `vercel.json`

**Step 1: Create vercel.json**

Create `vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "framework": "remix",
  "crons": [
    {
      "path": "/api/cron/reset-billing",
      "schedule": "0 0 * * *"
    }
  ]
}
```

**Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: add Vercel configuration with billing cron"
```

---

### Task 8.4: Create Billing Reset Cron

**Files:**
- Create: `app/routes/api.cron.reset-billing.tsx`

**Step 1: Create cron route**

Create `app/routes/api.cron.reset-billing.tsx`:
```typescript
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
```

**Step 2: Add CRON_SECRET to .env.example**

```
CRON_SECRET=your-random-secret
```

**Step 3: Commit**

```bash
git add app/routes/api.cron.reset-billing.tsx .env.example
git commit -m "feat: add billing reset cron job"
```

---

## Summary

**Total Tasks:** 22
**Estimated Commits:** 22

**Phase breakdown:**
1. Project Setup (3 tasks)
2. Core Data Layer (3 tasks)
3. Video Generation Pipeline (4 tasks)
4. API Routes (4 tasks)
5. UI Components (4 tasks)
6. Billing Integration (2 tasks)
7. Webhooks (2 tasks)
8. Final Setup (4 tasks)

**Post-implementation:**
- Set up Neon database
- Set up Upstash Redis
- Set up Cloudflare R2 bucket
- Configure Shopify app in Partner dashboard
- Deploy to Vercel
- Test full flow with dev store
