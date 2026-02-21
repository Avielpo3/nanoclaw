# 03 - Job System (pg-boss)

## Overview

pg-boss provides durable job queuing over PostgreSQL. Jobs survive server restarts. Each job type maps to a named queue.

## Queue Definitions

```typescript
// src/infrastructure/queue/boss-client.ts
import PgBoss from 'pg-boss';

const boss = new PgBoss({
  connectionString: config.database.url,
  schema: 'pgboss',
  retryLimit: 3,
  retryDelay: 600,              // 10 min between retries
  retryBackoff: true,           // Exponential backoff
  expireInHours: 24,            // Job expires if not completed in 24h
  archiveCompletedAfterSeconds: 7 * 24 * 3600, // Archive after 7 days
  monitorStateIntervalSeconds: 30,
  deleteAfterDays: 30,
});

// Queue names
export const QUEUES = {
  APPEAL: 'appeal',             // Main appeal processing queue
  NOTIFICATION: 'notification', // Failure notifications
  CLEANUP: 'cleanup',           // Screenshot/temp file cleanup
} as const;
```

## Job Lifecycle

```
API Request
    │
    ▼
┌──────────┐    Validation     ┌──────────────┐
│ Validate  │───── FAIL ──────→│ VALIDATION   │ (stored in DB, not queued)
│  Input    │                  │ _ERROR       │
└────┬─────┘                  └──────────────┘
     │ PASS
     ▼
┌──────────┐
│ Save to  │──→ Job.status = PENDING
│ Database │
└────┬─────┘
     │
     ▼
┌──────────┐
│ Enqueue  │──→ Job.status = QUEUED
│ pg-boss  │    boss.send('appeal', { jobId })
└────┬─────┘
     │
     ▼
┌──────────┐
│ Worker   │──→ Job.status = PROCESSING
│ Picks Up │    Job.attempts += 1
└────┬─────┘
     │
     ├── SUCCESS ──→ Job.status = SUCCESS, Job.result = {...}
     │
     └── FAILURE
          │
          ├── attempts < maxAttempts ──→ Job.status = QUEUED (retry)
          │                              pg-boss auto-retries with backoff
          │
          └── attempts >= maxAttempts ──→ Job.status = FAILED
                                         Send notification
```

## Worker Implementation

```typescript
// src/infrastructure/queue/worker.ts
import { boss, QUEUES } from './boss-client';
import { processJob } from '@/application/process-job';
import { logger } from '@/infrastructure/logging/logger';

export async function startWorker() {
  await boss.start();

  // Main appeal worker
  await boss.work(
    QUEUES.APPEAL,
    {
      teamSize: 2,            // Process 2 jobs concurrently max
      teamConcurrency: 1,     // 1 at a time per "team member"
      teamRefill: true,       // Refill team as jobs complete
    },
    async (job) => {
      const log = logger.child({ jobId: job.data.jobId, queue: QUEUES.APPEAL });
      log.info('Worker picked up job');

      try {
        await processJob(job.data.jobId);
      } catch (error) {
        log.error({ error }, 'Job processing failed');
        throw error; // pg-boss handles retry
      }
    }
  );

  // Notification worker
  await boss.work(QUEUES.NOTIFICATION, async (job) => {
    await sendNotification(job.data);
  });

  logger.info('Workers started');
}
```

## Scheduled Jobs (Cron)

```typescript
// src/infrastructure/queue/scheduler.ts
export async function startScheduler() {
  // Retry stuck jobs every 15 minutes
  await boss.schedule('retry-stuck', '*/15 * * * *', {}, {
    tz: 'Asia/Jerusalem',
  });

  // Daily stats report at 8am
  await boss.schedule('daily-report', '0 8 * * *', {}, {
    tz: 'Asia/Jerusalem',
  });

  // Cleanup old screenshots weekly
  await boss.schedule('cleanup', '0 3 * * 0', {}, {
    tz: 'Asia/Jerusalem',
  });

  // Listen for scheduled jobs
  await boss.work('retry-stuck', retryStuckJobs);
  await boss.work('daily-report', generateDailyReport);
  await boss.work('cleanup', cleanupOldFiles);
}
```

## Concurrency Control

```typescript
// Per-site concurrency limits
// Metropark might block if we hit them too fast
const SITE_CONCURRENCY: Record<string, number> = {
  metropark: 2,   // Max 2 concurrent browsers on Metropark
  lola: 1,        // Lola is slower, 1 at a time
  mitar: 2,
};
```

pg-boss handles this via `teamSize` per queue. If we need per-site limits, we use separate queues per site: `appeal.metropark`, `appeal.lola`.

## Circuit Breaker (Review I3)

Prevents burning retry budgets when a site is down.

```typescript
// src/infrastructure/queue/circuit-breaker.ts
interface CircuitState {
  failures: number;
  lastFailure: Date | null;
  state: 'closed' | 'open' | 'half-open';
  openedAt: Date | null;
}

const FAILURE_THRESHOLD = 5;        // Open circuit after 5 consecutive failures
const RECOVERY_TIMEOUT = 300_000;   // Try again after 5 minutes

const circuits = new Map<string, CircuitState>();

export function recordFailure(siteSlug: string, errorCode: string): void {
  // Only count site-level failures (not validation or report-not-found)
  if (!['SITE_UNAVAILABLE', 'TIMEOUT', 'CRAWLER_ERROR'].includes(errorCode)) return;

  const circuit = circuits.get(siteSlug) || { failures: 0, lastFailure: null, state: 'closed', openedAt: null };
  circuit.failures++;
  circuit.lastFailure = new Date();

  if (circuit.failures >= FAILURE_THRESHOLD) {
    circuit.state = 'open';
    circuit.openedAt = new Date();
    logger.warn({ siteSlug, failures: circuit.failures }, 'Circuit breaker OPENED — site queue paused');
    // Notify operator
  }

  circuits.set(siteSlug, circuit);
}

export function recordSuccess(siteSlug: string): void {
  circuits.set(siteSlug, { failures: 0, lastFailure: null, state: 'closed', openedAt: null });
}

export function canProcess(siteSlug: string): boolean {
  const circuit = circuits.get(siteSlug);
  if (!circuit || circuit.state === 'closed') return true;

  if (circuit.state === 'open') {
    // Check if recovery timeout elapsed
    if (Date.now() - circuit.openedAt!.getTime() > RECOVERY_TIMEOUT) {
      circuit.state = 'half-open';
      return true; // Allow one test request
    }
    return false;
  }

  return true; // half-open: allow one through
}
```

## Deadline-Based Priority (Review C3)

Jobs with approaching deadlines get higher priority in the queue.

```typescript
function calculatePriority(deadline?: Date): number {
  if (!deadline) return 0; // Default priority

  const daysRemaining = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (daysRemaining <= 2) return 10;  // Urgent
  if (daysRemaining <= 5) return 5;   // High
  if (daysRemaining <= 10) return 2;  // Medium
  return 0;                            // Normal
}
```

## Worker Pause/Resume (Review I7)

Operators can pause job processing from the Settings page during maintenance.

```typescript
let isWorkerPaused = false;

export function pauseWorker() {
  isWorkerPaused = true;
  boss.offWork(QUEUES.APPEAL);
  logger.info('Worker PAUSED by operator');
}

export function resumeWorker() {
  isWorkerPaused = false;
  startWorker(); // Re-subscribe to queues
  logger.info('Worker RESUMED by operator');
}
```

## Dead-Letter Queue

When a job exceeds `maxAttempts`, pg-boss moves it to the archive. We detect this and update our Job record:

```typescript
boss.onComplete(QUEUES.APPEAL, async (job) => {
  if (job.data.failed) {
    await prisma.job.update({
      where: { id: job.data.request.data.jobId },
      data: { status: 'FAILED' },
    });
    await boss.send(QUEUES.NOTIFICATION, {
      type: 'job_failed',
      jobId: job.data.request.data.jobId,
    });
  }
});
```

## Enqueueing a Job

```typescript
// src/application/submit-appeal.ts
export async function submitAppeal(input: AppealInput): Promise<Job> {
  // 1. Validate
  const validated = appealInputSchema.parse(input);

  // 2. Resolve issuer
  const issuer = await resolveIssuer(validated);

  // 3. Create Job record
  const job = await prisma.job.create({
    data: {
      type: mapAppealType(validated.appealType),
      status: 'PENDING',
      siteId: issuer.siteId,
      issuerId: issuer.id,
      input: validated,
      validatedInput: validated,
      externalId: validated.externalId,
    },
  });

  // 4. Log event
  await createJobEvent(job.id, 'CREATED', 'Job created from API request');

  // 5. Enqueue in pg-boss
  await boss.send(QUEUES.APPEAL, { jobId: job.id }, {
    priority: job.priority,
    retryLimit: job.maxAttempts,
    retryDelay: 600,
    retryBackoff: true,
  });

  // 6. Update status
  await prisma.job.update({
    where: { id: job.id },
    data: { status: 'QUEUED' },
  });

  await createJobEvent(job.id, 'QUEUED', 'Job enqueued for processing');

  return job;
}
```
