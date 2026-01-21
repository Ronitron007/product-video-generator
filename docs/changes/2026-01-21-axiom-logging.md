# Axiom Logging Integration

**Date:** 2026-01-21
**Type:** Feature Addition

## Summary

Added structured logging with Axiom integration for centralized log management and observability.

## Changes Made

### 1. New Dependencies

```bash
npm install @axiomhq/js
```

**Package:** `@axiomhq/js` - Axiom's official JavaScript SDK

### 2. New Files Created

#### `app/lib/logger.server.ts`

Structured logging utility with:
- **Log levels:** debug, info, warn, error
- **Structured context:** shopDomain, shopId, jobId, productId, templateId, route, duration
- **Dual output:** Console (captured by Vercel) + Axiom (if configured)
- **Request timing helper:** `logRequest()` for measuring API durations

```typescript
import { logger, logRequest } from '~/lib/logger.server';

// Basic logging
logger.info('Message', { shopDomain: 'store.myshopify.com', jobId: '123' });
logger.error('Failed', { error: err.message });

// Request timing
const reqLog = logRequest('api.generate');
// ... do work ...
reqLog.end('success', { jobId: '123' });
```

### 3. Files Modified

| File | Changes |
|------|---------|
| `app/routes/api.generate.tsx` | Added request logging, error tracking, timing |
| `app/routes/api.products.tsx` | Added request logging, product count tracking |
| `app/routes/api.videos.tsx` | Added request logging, video count tracking |
| `app/workers/video.worker.ts` | Added job processing logs, status updates, error tracking |
| `.env.example` | Added `AXIOM_TOKEN` and `AXIOM_DATASET` variables |

### 4. Log Events Added

#### API Routes

| Route | Events Logged |
|-------|---------------|
| `api.generate` | Request start, shop resolved, plan limit check, validation, job created, job queued, errors |
| `api.products` | Request start, products fetched with count, errors |
| `api.videos` | Request start, videos fetched with count, errors |

#### Video Worker

| Event | Context |
|-------|---------|
| `Processing video job` | jobId, shopId, templateId, imageCount |
| `Job status updated` | jobId, status |
| `Template not found` | jobId, templateId |
| `Starting video generation` | jobId, templateId, prompt preview |
| `Video generation started` | jobId, operationId |
| `Video generation in progress` | jobId, operationId, attempts (every 30s) |
| `Video generation completed` | jobId, operationId, videoUrl |
| `Video generation failed` | jobId, operationId, error |
| `Video generation timed out` | jobId, operationId, attempts |
| `Video job failed` | jobId, shopId, error |
| `Worker job completed/failed` | bullJobId, jobId |

## Environment Variables

### Required for Axiom

Add to Vercel (optional - logging works without it via console):

```bash
vercel env add AXIOM_TOKEN production
vercel env add AXIOM_DATASET production
```

| Variable | Description | Example |
|----------|-------------|---------|
| `AXIOM_TOKEN` | API token from Axiom dashboard | `xaat-abc123...` |
| `AXIOM_DATASET` | Dataset name for logs | `product-video-generator` |

## Setup Instructions

### Option A: Axiom Cloud (Recommended)

1. Sign up at [axiom.co](https://axiom.co)
2. Create a dataset named `product-video-generator`
3. Generate an API token with ingest permissions
4. Add env vars to Vercel:
   ```bash
   vercel env add AXIOM_TOKEN production <<< "xaat-your-token"
   vercel env add AXIOM_DATASET production <<< "product-video-generator"
   ```
5. Redeploy

### Option B: Vercel Integration

1. Go to Vercel Dashboard → Integrations
2. Search "Axiom" → Install
3. Connect your Axiom account
4. Logs automatically flow to Axiom

## Viewing Logs

### Vercel Dashboard
```bash
vercel logs product-video-generator-nu.vercel.app --follow
```

### Axiom Dashboard
1. Go to axiom.co → Datasets → product-video-generator
2. Use APL queries:
   ```apl
   | where level == "error"
   | where shopDomain == "store.myshopify.com"
   | where route == "api.generate"
   ```

## Log Format

All logs are JSON structured:

```json
{
  "timestamp": "2026-01-21T10:30:00.000Z",
  "level": "info",
  "message": "Video job created",
  "service": "product-video-generator",
  "environment": "production",
  "shopDomain": "store.myshopify.com",
  "shopId": "clxyz123",
  "jobId": "job_abc456",
  "productId": "gid://shopify/Product/123",
  "templateId": "zoom-pan",
  "duration": 125
}
```

## Rollback

To remove logging:
1. Revert this commit
2. Remove `AXIOM_TOKEN` and `AXIOM_DATASET` env vars
3. Run `npm uninstall @axiomhq/js`
4. Redeploy
