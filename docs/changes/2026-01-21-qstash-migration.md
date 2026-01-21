# QStash Migration: Fixing Background Job Processing

**Date:** 2026-01-21
**Type:** Architecture Fix
**Status:** Planned

---

## The Problem

### What Happened
Video generation jobs were stuck in "queued" status forever. Users would click "Generate Video", see the job created, but it would never process.

### Root Cause
We used **BullMQ + Redis** for background job processing, but deployed to **Vercel (serverless)**.

```
BullMQ Architecture (what we built):
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   API Request → Create Job → Add to Redis Queue             │
│                                    ↓                        │
│                              ┌─────────────┐                │
│                              │   WORKER    │ ← Must run 24/7│
│                              │  (polling)  │                │
│                              └─────────────┘                │
│                                    ↓                        │
│                           Process Video Job                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘

The Problem:
- BullMQ workers need a PERSISTENT PROCESS watching the queue
- Vercel is SERVERLESS - code only runs during requests
- No one starts the worker → jobs never get processed
```

### Why This Wasn't Caught Earlier
1. BullMQ is a standard Node.js queue solution
2. Works perfectly on traditional servers (EC2, DigitalOcean, Railway)
3. The code was correct - the deployment environment was wrong
4. Should have considered Vercel's serverless nature during architecture design

---

## The Solution: QStash

### Why QStash
| Criteria | BullMQ (broken) | QStash (solution) |
|----------|-----------------|-------------------|
| Architecture | Worker polls queue | Queue calls your endpoint |
| Serverless compatible | ❌ No | ✅ Yes |
| Already using | Upstash Redis | Same vendor (Upstash) |
| Max timeout | N/A | 2 hours |
| Retries | Manual setup | Built-in |
| Cost | Redis only | $1/100K messages |

### How QStash Works

```
QStash Architecture (push-based):
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   API Request → Create Job → Send to QStash                 │
│                                    ↓                        │
│                              ┌─────────────┐                │
│                              │   QSTASH    │                │
│                              │  (Upstash)  │                │
│                              └─────────────┘                │
│                                    ↓                        │
│                    HTTP POST to /api/process-video          │
│                         (YOUR endpoint)                     │
│                                    ↓                        │
│                           Process Video Job                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Key Difference:
- BullMQ: Your worker PULLS jobs from queue (needs always-on process)
- QStash: Queue PUSHES jobs to your endpoint (works serverless)
```

### Using Upstash Workflow

For long-running jobs (30-60 seconds), we'll use **Upstash Workflow** which breaks the job into retryable steps:

```typescript
import { serve } from "@upstash/workflow/nextjs";

export const { POST } = serve(async (context) => {
  const { jobId, shopId, templateId, sourceImageUrls } = context.requestPayload;

  // Step 1: Update status to processing
  await context.run("update-status", async () => {
    await updateJobStatus(jobId, "processing");
  });

  // Step 2: Generate video (30-60 seconds)
  const result = await context.run("generate-video", async () => {
    const template = getTemplate(templateId);
    const { operationId } = await generateVideo({
      prompt: template.prompt,
      referenceImageUrls: sourceImageUrls,
      duration: template.duration,
    });
    return { operationId };
  });

  // Step 3: Poll for completion
  const videoUrl = await context.run("poll-completion", async () => {
    return await pollUntilComplete(result.operationId);
  });

  // Step 4: Save result
  await context.run("save-result", async () => {
    await updateJobStatus(jobId, "done", { videoUrl });
    await incrementVideosUsed(shopId);
  });
});
```

**Benefits of Workflow steps:**
- Each step is a separate HTTP request
- If step 3 fails, only step 3 retries (not the whole job)
- State persisted between steps
- 2-hour total timeout

---

## Implementation Plan

### Files to Change

| File | Change |
|------|--------|
| `package.json` | Add `@upstash/qstash`, `@upstash/workflow` |
| `app/lib/queue.server.ts` | Replace BullMQ with QStash client |
| `app/workers/video.worker.ts` | Delete (no longer needed) |
| `app/routes/api.process-video.tsx` | New - QStash calls this endpoint |
| `app/routes/api.generate.tsx` | Update to use QStash instead of BullMQ |
| `.env.example` | Add `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` |

### Environment Variables

```bash
# QStash (from Upstash dashboard)
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
QSTASH_URL=https://qstash.upstash.io
```

### Migration Steps

1. Install QStash packages
2. Create new `/api/process-video` endpoint
3. Update `/api/generate` to publish to QStash
4. Add QStash env vars to Vercel
5. Deploy and test
6. Remove BullMQ code and dependencies

---

## Alternatives Considered

| Solution | Verdict |
|----------|---------|
| **Inngest** | Good option, but adds new vendor. QStash keeps us in Upstash ecosystem. |
| **Trigger.dev** | Best for heavy processing, but overkill for 60s jobs. Consider if we need unlimited timeout later. |
| **Vercel waitUntil** | No retries, not designed for job queues. Too risky for paid feature. |
| **Separate worker server** | Works, but adds infrastructure complexity and $5+/mo cost. |
| **Synchronous processing** | Would work, but blocks API response for 60s. Bad UX. |

---

## Cost Impact

| Service | Before | After |
|---------|--------|-------|
| Upstash Redis | ~$0 (free tier) | ~$0 (free tier) |
| QStash | $0 | ~$0 (1K free msgs/day) |
| BullMQ | $0 | $0 (removed) |

**Net cost change:** $0 for MVP volume

---

## Lessons Learned

1. **Consider deployment target during architecture design** - not all patterns work everywhere
2. **Push vs Pull queues** - serverless needs push-based (webhook) queues
3. **Upstash ecosystem** - QStash, Redis, and Workflow work well together for serverless
4. **Test the full flow early** - would have caught this on first deploy

---

## References

- [QStash Documentation](https://upstash.com/docs/qstash)
- [Upstash Workflow Documentation](https://upstash.com/docs/workflow)
- [Why BullMQ doesn't work on serverless](https://docs.bullmq.io/guide/going-to-production#serverless)
