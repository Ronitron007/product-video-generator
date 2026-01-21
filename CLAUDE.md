# Agent Instructions

## Logging

All server-side code MUST use structured logging via Axiom. Import and use the logger:

```typescript
import { logger, logRequest } from '~/lib/logger.server';
```

### Basic logging

```typescript
logger.info('Message', { jobId, shopId, ...context });
logger.error('Error message', { error: err.message, ...context });
logger.warn('Warning', { ...context });
logger.debug('Debug info', { ...context });
```

### Request logging

For API routes, use `logRequest` to track request duration:

```typescript
export async function action({ request }: ActionFunctionArgs) {
  const reqLog = logRequest('api.route-name');

  // ... route logic ...

  reqLog.end('success', { jobId });  // or 'error'
  return json({ ... });
}
```

### Required context fields

Always include relevant context:
- `route` - API route name
- `jobId` - video job ID when applicable
- `shopId` - shop identifier
- `shopDomain` - Shopify shop domain
- `reason` - error reason for failures

### Example

```typescript
import { logger, logRequest } from '~/lib/logger.server';

export async function action({ request }: ActionFunctionArgs) {
  const reqLog = logRequest('api.my-route');

  try {
    logger.info('Starting operation', { route: 'api.my-route', shopId });

    // ... do work ...

    logger.info('Operation completed', { route: 'api.my-route', shopId });
    reqLog.end('success', { shopId });
    return json({ success: true });
  } catch (error) {
    logger.error('Operation failed', {
      route: 'api.my-route',
      shopId,
      error: error instanceof Error ? error.message : String(error)
    });
    reqLog.end('error', { shopId, reason: 'exception' });
    return json({ error: 'Failed' }, { status: 500 });
  }
}
```

## Background Jobs

Background jobs use QStash (not BullMQ). See `app/lib/queue.server.ts`.

To queue a video job:
```typescript
import { addVideoJob } from '~/lib/queue.server';

await addVideoJob({ jobId, shopId, sourceImageUrls, templateId });
```

QStash calls `/api/process-video` endpoint to process jobs.

## Environment Variables

Required for QStash:
- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`

Required for Axiom logging:
- `AXIOM_TOKEN`
- `AXIOM_DATASET`
