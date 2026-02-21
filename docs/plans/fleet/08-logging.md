# 08 - Logging & Observability

## Logging Strategy

Every action in the system produces a structured log entry. Logs serve three purposes:
1. **Debugging** — trace exactly what happened during a job
2. **Auditing** — who did what, when
3. **Monitoring** — detect patterns, failures, anomalies

## Logger Setup (Pino)

```typescript
// src/infrastructure/logging/logger.ts
import pino from 'pino';

export const logger = pino({
  level: config.logging.level,
  transport: config.logging.pretty
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
  base: {
    service: 'fleet-service',
    env: process.env.NODE_ENV,
  },
  serializers: {
    error: pino.stdSerializers.err,
  },
  // Redact sensitive fields from logs
  redact: ['input.idNumber', 'input.phone', 'captchaToken', '*.apiKey'],
});

// Create child loggers with context
export function createJobLogger(jobId: string, context?: string) {
  return logger.child({ jobId, context: context || 'worker' });
}

export function createRequestLogger(correlationId: string) {
  return logger.child({ correlationId, context: 'api' });
}
```

## Log Levels — When to Use Each

| Level | When | Example |
|-------|------|---------|
| `DEBUG` | Detailed step-by-step actions | `Filling field #txtReportId with value length 8` |
| `INFO` | Significant state transitions | `Job abc123 status changed to PROCESSING` |
| `WARN` | Recoverable issues, retries | `CAPTCHA solve timeout, retrying (attempt 2/3)` |
| `ERROR` | Failures requiring attention | `Job def456 failed: selector not found after 10s` |
| `FATAL` | System-level failures | `Database connection lost`, `Worker process crashed` |

## What Gets Logged

### API Layer
```
INFO  api     POST /api/jobs - 201 (45ms) correlationId=abc-123
WARN  api     POST /api/jobs - 400 Validation failed: firstName too short
ERROR api     POST /api/jobs - 500 Internal error correlationId=abc-123
```

### Job Lifecycle
```
INFO  worker  Job abc123 picked up from queue (attempt 1/3)
INFO  worker  Job abc123 assigned to MetroparkAdapter
INFO  browser Page loaded: https://www.metropark.co.il/... (2.3s)
DEBUG browser Filling #txtReportId (8 chars)
DEBUG browser Filling #txtLicenseNumber (7 chars)
INFO  captcha Requesting 2captcha solution for siteKey=6Lc...
INFO  captcha CAPTCHA solved in 19.2s
DEBUG browser Injecting CAPTCHA token into #g-recaptcha-response
INFO  browser Clicking submit button
INFO  browser Navigation complete (3.1s)
INFO  metropark Success detected: "הבקשה הוגשה בהצלחה" ref=98765
INFO  worker  Job abc123 completed successfully (38.2s total)
```

### Failure Scenarios
```
WARN  browser Timeout waiting for #txtReportId (10s) - retrying
ERROR metropark Report not found: "דוח/תיק לא נמצא"
ERROR captcha 2captcha returned ERROR_CAPTCHA_UNSOLVABLE
WARN  worker  Job def456 failed (attempt 2/3), scheduling retry in 600s
ERROR worker  Job def456 exhausted all retries (3/3), marking FAILED
INFO  notify  Sending failure notification for job def456 to admin@company.com
```

## Audit Trail (Database-backed)

Every significant action writes to the `JobEvent` table. This is separate from Pino logs — it's the permanent audit record visible in the UI timeline.

```typescript
// src/infrastructure/logging/audit.ts
import { prisma } from '../database/prisma-client';

export async function createJobEvent(
  jobId: string,
  type: JobEventType,
  message: string,
  data?: Record<string, unknown>,
) {
  await prisma.jobEvent.create({
    data: { jobId, type, message, data: data ?? undefined },
  });

  // Also log to Pino for real-time visibility
  const log = createJobLogger(jobId, 'audit');
  log.info({ eventType: type, data }, message);
}
```

### Events Logged to Audit Trail

| Event | Trigger | Data |
|-------|---------|------|
| `CREATED` | API receives valid request | `{ source: 'api', correlationId }` |
| `VALIDATED` | Input passes Zod + site-specific validation | `{ warnings: [...] }` |
| `VALIDATION_FAILED` | Input fails validation | `{ errors: [...] }` |
| `QUEUED` | Job sent to pg-boss | `{ queueName, priority }` |
| `PROCESSING_STARTED` | Worker picks up job | `{ attempt, workerId }` |
| `PAGE_LOADED` | Playwright navigates to form | `{ url, loadTime }` |
| `FORM_FILLED` | All form fields populated | `{ fieldCount }` |
| `CAPTCHA_REQUESTED` | CAPTCHA solve started | `{ siteKey, provider: '2captcha' }` |
| `CAPTCHA_SOLVED` | CAPTCHA token received | `{ solveTime }` |
| `CAPTCHA_FAILED` | CAPTCHA solve failed | `{ error, attempt }` |
| `FORM_SUBMITTED` | Submit button clicked | `{}` |
| `SUCCESS_DETECTED` | Success text found on page | `{ referenceNumber, pageText }` |
| `FAILURE_DETECTED` | Error text found on page | `{ errorText, screenshotPath }` |
| `RETRY_SCHEDULED` | Job re-queued after failure | `{ attempt, nextAttemptAt, retryDelay }` |
| `MAX_RETRIES_REACHED` | No more retries | `{ totalAttempts }` |
| `CANCELLED` | Manual cancellation | `{ cancelledBy }` |
| `SCREENSHOT_TAKEN` | Screenshot captured | `{ path, stage }` |
| `ERROR` | Unexpected error | `{ error, stack }` |

## System Logs — DEFERRED to Phase 6

> **Review decision (I2)**: The SystemLog DB table and Pino DB transport are deferred to Phase 6.
>
> **Phase 1-5 approach**: Pino writes to stdout only. Use `docker logs` for real-time debugging.
> The JobEvent audit trail (permanent, per-job) covers the primary debugging use case.
>
> When Phase 6 is implemented, add a Pino transport that writes INFO+ logs to a `SystemLog` table,
> and build the Logs tab UI to query it.

## Correlation IDs

Every request/job gets a correlation ID that links all related log entries:

```
API Request (correlationId: abc-123)
  → Job Created (correlationId: abc-123, jobId: job-456)
    → Worker Processing (correlationId: abc-123, jobId: job-456)
      → Browser Actions (correlationId: abc-123, jobId: job-456)
      → CAPTCHA Solve (correlationId: abc-123, jobId: job-456)
    → Job Complete (correlationId: abc-123, jobId: job-456)
  → API Response (correlationId: abc-123)
```

Search by correlationId in the Logs tab to see the full trace.

## Log Retention

| Storage | Retention | Purpose |
|---------|-----------|---------|
| Pino stdout | Ephemeral | Real-time debugging |
| SystemLog table | 90 days | UI log viewer, searching |
| JobEvent table | Permanent | Audit trail per job |
| Screenshots | 30 days | Visual debugging |
