# Phase 2: Core Data Layer

## Overview
Built service layer for database operations with full test coverage.

## Tasks Completed

### Task 2.1: Create Prisma Client Singleton
- Created `app/lib/db.server.ts`
- Singleton pattern prevents connection exhaustion in dev
- Global caching for hot reload compatibility

### Task 2.2: Create Shop Service
- CRUD operations: `getShopByDomain`, `createShop`, `updateShop`, `deleteShop`
- Plan limit constants: trial=1, basic=20, pro=100 videos/month
- `canGenerateVideo()` - checks if shop within plan limits
- `incrementVideosUsed()` - tracks monthly usage
- `resetAllMonthlyUsage()` - for billing cycle reset
- Full test coverage (7 tests)

### Task 2.3: Create VideoJob Service
- CRUD: `createVideoJob`, `getJobsByShop`, `getJobById`, `updateJobStatus`
- Status flow: queued → processing → done/failed
- Includes source images, template, error handling
- Full test coverage (7 tests)

## Files Created
```
app/lib/
  db.server.ts
app/services/
  shop.server.ts
  shop.server.test.ts
  video-job.server.ts
  video-job.server.test.ts
```

## Plan Limits
| Plan  | Videos/Month |
|-------|-------------|
| trial | 1           |
| basic | 20          |
| pro   | 100         |
