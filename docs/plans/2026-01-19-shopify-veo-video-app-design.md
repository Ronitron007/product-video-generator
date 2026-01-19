# Shopify Product Video Generator - Design Doc

Shopify app that generates product videos from images using Google Veo 3.1. Subscription model with tiered pricing.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Shopify Admin                            │
│                    (Embedded App)                            │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                   Next.js App (Vercel)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   App UI    │  │ API Routes  │  │  Shopify App Bridge │  │
│  │  (React)    │  │  /api/*     │  │     + OAuth         │  │
│  └─────────────┘  └──────┬──────┘  └─────────────────────┘  │
└──────────────────────────┼──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
│  PostgreSQL  │  │    Redis     │  │   Google Veo 3.1     │
│   (Neon)     │  │  (Upstash)   │  │       API            │
│              │  │  + BullMQ    │  │                      │
└──────────────┘  └──────────────┘  └──────────────────────┘
```

**Stack:**
- Next.js on Vercel - UI, API, Shopify OAuth, webhooks
- PostgreSQL (Neon) - users, subscriptions, video jobs
- Redis (Upstash) + BullMQ - async video generation queue
- Cloudflare R2 - video storage
- Veo 3.1 API - image-to-video generation

## Data Model

```
Shop
├── id
├── shopifyDomain        "mystore.myshopify.com"
├── accessToken          encrypted Shopify API token
├── plan                 "trial" | "basic" | "pro"
├── videosUsedThisMonth  12
├── billingCycleStart    2026-01-01
└── createdAt

VideoJob
├── id
├── shopId               FK → Shop
├── shopifyProductId     "gid://shopify/Product/123"
├── sourceImageUrls      ["url1", "url2", "url3"] (max 3)
├── templateId           "360-spin" | "lifestyle" | "zoom-pan"
├── status               "queued" | "processing" | "done" | "failed"
├── videoUrl             output video URL
├── errorMessage         null or failure reason
└── createdAt

ProductEmbed
├── id
├── videoJobId           FK → VideoJob
├── shopifyProductId     product where video was embedded
├── shopifyMediaId       Shopify's media ID
└── createdAt
```

**Templates (config):**
```ts
const TEMPLATES = {
  "zoom-pan": { prompt: "Slow cinematic zoom...", duration: 4 },
  "lifestyle": { prompt: "Product in lifestyle setting...", duration: 6 },
  "360-spin": { prompt: "Product rotating 360 degrees...", duration: 5 },
}
```

## Core Flows

**Onboarding:**
1. Merchant clicks "Add app" in Shopify App Store
2. Shopify OAuth → app receives access token
3. App creates Shop record (plan: "trial")
4. Welcome screen with template examples
5. Prompt to create first free video

**Generate Video:**
1. Dashboard → "Create Video"
2. Select product from catalog
3. Pick 1-3 images
4. Choose template
5. Click "Generate" → job queued
6. Background worker calls Veo 3.1
7. User checks "My Videos" for status/result

**Embed Video:**
1. View completed video in "My Videos"
2. Click "Add to Product Page"
3. App calls Shopify API to add media
4. Video appears on product page

## Shopify Integration

**API Endpoints Used:**
- `GET /products.json` - fetch catalog
- `GET /products/{id}/images.json` - get product images
- `POST /products/{id}/media.json` - add video to product
- Billing API for subscriptions

**Webhooks:**
- `app/uninstalled` - cleanup
- `shop/update` - sync shop info
- `products/delete` - remove orphaned jobs

**Scopes:**
- read_products, write_products
- read_files, write_files

## Video Pipeline

```
API Route → Redis Queue → Worker → Veo 3.1 → Storage → Update DB
```

**Worker Process:**
1. Update job status to "processing"
2. Fetch source images
3. Get template prompt
4. Call Veo 3.1 with images + prompt
5. Poll until video ready
6. Upload to R2 storage
7. Update job with video URL

**Error Handling:**
- BullMQ auto-retries (3 attempts, exponential backoff)
- After 3 failures → status: "failed"

## Pricing

| Plan | Price | Videos/Month |
|------|-------|--------------|
| Trial | Free | 1 (one-time) |
| Basic | $19/mo | 20 |
| Pro | $49/mo | 100 |

- All plans: all templates, download, one-click embed
- 1 free video trial, usable anywhere
- Uses Shopify native billing
- Monthly cron resets videosUsedThisMonth

## Pages

```
/app
├── /                    → Dashboard
├── /create              → Product picker + template selection
├── /videos              → My Videos list
├── /videos/[id]         → Video view (preview, download, embed)
├── /settings            → Plan info, billing
└── /upgrade             → Plan comparison
```

UI uses Shopify Polaris component library.

## Testing & Deployment

**Testing:**
- Unit: Vitest
- API: Vitest + MSW (mocked responses)
- E2E: Playwright
- Manual: Shopify dev store

**Deployment:**
- Next.js → Vercel
- PostgreSQL → Neon
- Redis → Upstash
- Storage → Cloudflare R2
- Cron → Vercel Cron

## MVP Scope

**In:**
- Shopify OAuth + embedded app
- Manual product selection
- 1-3 image selection
- 3 templates
- Background generation + dashboard
- Download + one-click embed
- Tiered billing via Shopify

**Out (future):**
- Bulk selection by collection
- Smart product suggestions
- Custom prompts
- Analytics

## Unresolved

1. App name?
2. Exact Veo prompts for templates?
3. Video retention period?
4. Google Cloud / Veo API access?
5. Priority queue for Pro - MVP or later?
6. Domain?
