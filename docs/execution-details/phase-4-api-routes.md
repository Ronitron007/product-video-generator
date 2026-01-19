# Phase 4: API Routes

## Overview
Built REST API endpoints for products, video generation, listing, and embedding.

## Tasks Completed

### Task 4.1: Create Products API Route
- `GET /api/products` at `app/routes/api.products.tsx`
- Fetches products from Shopify Admin GraphQL API
- Returns: id, title, images (id, url, altText)
- Authenticated via session

### Task 4.2: Create Generate Video API Route
- `POST /api/generate` at `app/routes/api.generate.tsx`
- Request body: productId, imageUrls[], templateId
- Validates:
  - Shop exists and authenticated
  - Plan limits not exceeded
  - Template exists
  - 1-3 images provided
- Creates VideoJob record
- Adds job to BullMQ queue
- Returns: { success, jobId } or { error, upgradeRequired }

### Task 4.3: Create Videos List API Route
- `GET /api/videos` at `app/routes/api.videos.tsx`
- Returns all VideoJobs for authenticated shop
- Ordered by createdAt descending
- Fields: id, productId, templateId, status, videoUrl, createdAt

### Task 4.4: Create Embed Video API Route
- `POST /api/embed` at `app/routes/api.embed.tsx`
- Request body: jobId
- Fetches completed video job
- Calls Shopify productCreateMedia mutation
- Creates ProductEmbed record
- Returns: { success, mediaId }

## Files Created
```
app/routes/
  api.products.tsx
  api.generate.tsx
  api.videos.tsx
  api.embed.tsx
```

## API Summary
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/products | List shop products |
| POST | /api/generate | Start video generation |
| GET | /api/videos | List video jobs |
| POST | /api/embed | Embed video on product |
