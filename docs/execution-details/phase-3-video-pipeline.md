# Phase 3: Video Generation Pipeline

## Overview
Built async video generation system with Veo 3.1, BullMQ worker, and R2 storage.

## Tasks Completed

### Task 3.1: Create Video Templates Config
- 3 curated templates at `app/config/templates.ts`:
  - `zoom-pan` - Cinematic zoom/pan (4s)
  - `lifestyle` - Product in lifestyle setting (6s)
  - `360-spin` - Full rotation view (5s)
- Each template has: id, name, prompt, duration
- Helper functions: `getTemplate()`, `getAllTemplates()`

### Task 3.2: Create Veo 3.1 Client
- Google Generative AI SDK integration
- `generateVideoFromImages()` - sends images + prompt to Veo
- `pollVideoStatus()` - polls until video ready
- `getVideoResult()` - retrieves completed video URL
- Placeholder implementation (API may need adjustment)

### Task 3.3: Create Video Worker
- BullMQ worker at `app/workers/video.worker.ts`
- Process flow:
  1. Update job → "processing"
  2. Fetch source images
  3. Call Veo 3.1 with template prompt
  4. Poll until complete
  5. Upload to R2 storage
  6. Update job with video URL
- Auto-retry: 3 attempts, exponential backoff

### Task 3.4: Create R2 Storage Client
- Cloudflare R2 (S3-compatible) at `app/lib/storage.server.ts`
- `uploadVideo()` - upload buffer to R2
- `getSignedVideoUrl()` - generate presigned URL (1hr expiry)
- `uploadVideoFromUrl()` - fetch + upload in one call
- Error handling on fetch failures

## Files Created
```
app/config/
  templates.ts
app/lib/
  veo.server.ts
  storage.server.ts
app/workers/
  video.worker.ts
```

## Architecture
```
API → Redis Queue → Worker → Veo 3.1 → R2 Storage → DB Update
```
