# Phase 7: Webhooks

## Overview
Set up Shopify webhooks for app lifecycle events.

## Tasks Completed

### Task 7.1: Create App Uninstalled Webhook
- `app/routes/webhooks.app.uninstalled.tsx`
- Triggered when merchant uninstalls app
- Actions:
  - Deletes Shop record (cascades to VideoJobs, ProductEmbeds)
  - Cleans up all associated data
- Validates webhook HMAC signature
- Returns 200 OK on success

### Task 7.2: Register Webhooks
- Updated `app/shopify.server.ts`
- Registers webhooks on app install/auth:
  - `APP_UNINSTALLED` - cleanup on uninstall
  - `SHOP_UPDATE` - sync shop info changes
  - `PRODUCTS_DELETE` - handle deleted products
- Uses Shopify webhook registration API

## Files Created/Modified
```
app/routes/
  webhooks.app.uninstalled.tsx
app/
  shopify.server.ts (modified)
```

## Webhooks Registered
| Topic | Purpose | Handler |
|-------|---------|---------|
| APP_UNINSTALLED | Cleanup data | webhooks.app.uninstalled.tsx |
| SHOP_UPDATE | Sync shop info | (future) |
| PRODUCTS_DELETE | Clean orphaned jobs | (future) |

## Security
- All webhooks validate HMAC signature
- Uses Shopify's webhook verification
- Rejects invalid/tampered requests
