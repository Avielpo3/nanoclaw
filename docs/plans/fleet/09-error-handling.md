# 09 - Error Handling

## Error Hierarchy

All custom errors extend a base `AppError` class. Each error type carries a code, HTTP status, and whether it's retryable.

```typescript
// src/domain/errors/base-error.ts
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  abstract readonly retryable: boolean;

  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = this.constructor.name;
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.cause && { cause: this.cause.message }),
    };
  }
}
```

### Error Types

```typescript
// Validation errors — bad input, never retry
export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
  readonly httpStatus = 400;
  readonly retryable = false;

  constructor(
    message: string,
    public readonly fields: { field: string; message: string }[],
  ) {
    super(message);
  }
}

// Report not found on site — might be wrong type, try fallback
export class ReportNotFoundError extends AppError {
  readonly code = 'REPORT_NOT_FOUND';
  readonly httpStatus = 404;
  readonly retryable = false; // Don't retry, but might fallback to different type

  constructor(public readonly appealType: string) {
    super(`Report not found via ${appealType}`);
  }
}

// Issuer/authority not found in our DB
export class IssuerNotFoundError extends AppError {
  readonly code = 'ISSUER_NOT_FOUND';
  readonly httpStatus = 404;
  readonly retryable = false;
}

// Browser/page errors — usually retryable
export class CrawlerError extends AppError {
  readonly code = 'CRAWLER_ERROR';
  readonly httpStatus = 502;
  readonly retryable = true;

  constructor(message: string, cause?: Error) {
    super(message, cause);
  }
}

// Timeout waiting for page/element
export class TimeoutError extends AppError {
  readonly code = 'TIMEOUT';
  readonly httpStatus = 504;
  readonly retryable = true;
}

// CAPTCHA solving failed
export class CaptchaError extends AppError {
  readonly code = 'CAPTCHA_ERROR';
  readonly httpStatus = 502;
  readonly retryable = true; // 2captcha might succeed next time
}

// Site detected us as a bot
export class BotDetectedError extends AppError {
  readonly code = 'BOT_DETECTED';
  readonly httpStatus = 403;
  readonly retryable = true; // Try again with different fingerprint
}

// Site is down or unreachable
export class SiteUnavailableError extends AppError {
  readonly code = 'SITE_UNAVAILABLE';
  readonly httpStatus = 503;
  readonly retryable = true;
}

// Duplicate job
export class DuplicateError extends AppError {
  readonly code = 'DUPLICATE';
  readonly httpStatus = 409;
  readonly retryable = false;
}
```

## Error Flow in Worker

```
Worker picks up job
    │
    ▼
try { adapter.execute(job, ctx) }
    │
    ├── Success ──→ status = SUCCESS, log event
    │
    └── Error caught
         │
         ├── error.retryable === true
         │    │
         │    ├── attempts < maxAttempts
         │    │   → status = QUEUED
         │    │   → log RETRY_SCHEDULED event
         │    │   → pg-boss handles re-delivery with backoff
         │    │
         │    └── attempts >= maxAttempts
         │        → status = FAILED
         │        → log MAX_RETRIES_REACHED event
         │        → send notification
         │
         └── error.retryable === false
              → status = FAILED (immediate, no retry)
              → log FAILURE_DETECTED event
              → send notification
```

### Implementation

```typescript
// src/application/process-job.ts
export async function processJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { issuer: { include: { site: true } } },
  });

  const log = createJobLogger(jobId, 'worker');
  const adapter = getAdapter(job.issuer.site.slug);

  // Update status
  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, lastAttemptAt: new Date() },
  });
  await createJobEvent(jobId, 'PROCESSING_STARTED', `Attempt ${job.attempts + 1}/${job.maxAttempts}`);

  const { context, page } = await createStealthPage();
  const screenshotDir = await screenshotStore.getJobDir(jobId);
  const startTime = Date.now();

  try {
    const result = await adapter.execute(job, {
      page,
      logger: log,
      screenshotDir,
      captchaSolver: new TwoCaptchaSolver(config.captcha.apiKey),
    });

    const processingTime = Date.now() - startTime;

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'SUCCESS',
        result: result as any,
        processingTime,
        completedAt: new Date(),
        screenshotPath: result.screenshots[result.screenshots.length - 1],
      },
    });

    await createJobEvent(jobId, 'SUCCESS_DETECTED', result.message, {
      referenceNumber: result.referenceNumber,
      processingTime,
    });

    log.info({ processingTime, referenceNumber: result.referenceNumber }, 'Job completed successfully');

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const appError = normalizeError(error);

    log.error({ error: appError, processingTime }, `Job failed: ${appError.message}`);

    // Take error screenshot
    const errorScreenshot = await page.screenshot({
      path: `${screenshotDir}/error-${Date.now()}.jpg`,
      type: 'jpeg',
      fullPage: true,
    }).catch(() => null);

    await createJobEvent(jobId, 'ERROR', appError.message, {
      code: appError.code,
      retryable: appError.retryable,
      processingTime,
      screenshotPath: errorScreenshot,
    });

    if (appError.retryable && job.attempts + 1 < job.maxAttempts) {
      // pg-boss will auto-retry based on its config
      await prisma.job.update({
        where: { id: jobId },
        data: {
          error: appError.toJSON() as any,
          processingTime,
        },
      });
      await createJobEvent(jobId, 'RETRY_SCHEDULED',
        `Retry ${job.attempts + 1}/${job.maxAttempts} scheduled`
      );
      throw error; // Re-throw so pg-boss knows to retry
    } else {
      // Final failure
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          error: appError.toJSON() as any,
          processingTime,
          completedAt: new Date(),
        },
      });
      await createJobEvent(jobId, 'MAX_RETRIES_REACHED',
        `All ${job.maxAttempts} attempts exhausted`
      );
      // Send notification
      await boss.send(QUEUES.NOTIFICATION, {
        type: 'job_failed',
        jobId,
        error: appError.toJSON(),
      });
    }
  } finally {
    await context.close();
  }
}

// Normalize unknown errors into AppError
function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      return new TimeoutError(error.message, error);
    }
    return new CrawlerError(error.message, error);
  }
  return new CrawlerError(String(error));
}
```

## API Error Handler

```typescript
// Wrap all API route handlers
export function withErrorHandler(handler: Function) {
  return async (req: NextRequest, ...args: any[]) => {
    try {
      return await handler(req, ...args);
    } catch (error) {
      if (error instanceof AppError) {
        return NextResponse.json(error.toJSON(), { status: error.httpStatus });
      }

      // Unexpected error
      logger.error({ error }, 'Unhandled API error');
      return NextResponse.json(
        { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        { status: 500 }
      );
    }
  };
}
```

## Operator-Friendly Error Messages (Review I9)

Technical error codes are mapped to actionable messages in the UI:

```typescript
// src/lib/constants.ts
export const ERROR_MESSAGES: Record<string, { title: string; action: string }> = {
  VALIDATION_ERROR: {
    title: 'Invalid input data',
    action: 'Check the input fields and correct any errors before resubmitting.',
  },
  REPORT_NOT_FOUND: {
    title: 'Report not found on the site',
    action: 'Verify the report number is correct. Try using "Clone & Edit" to fix the number or switch appeal type.',
  },
  CRAWLER_ERROR: {
    title: 'Unexpected page structure',
    action: 'The site may have been updated. If this persists, contact support.',
  },
  CAPTCHA_ERROR: {
    title: 'Automated verification failed',
    action: 'The CAPTCHA service may be temporarily degraded. The system will retry automatically.',
  },
  BOT_DETECTED: {
    title: 'Site blocked our access',
    action: 'The system will try again with different browser settings. If persistent, contact support.',
  },
  SITE_UNAVAILABLE: {
    title: 'Municipal site is currently down',
    action: 'The site appears to be offline. Jobs will be retried when the site recovers.',
  },
  TIMEOUT: {
    title: 'The site took too long to respond',
    action: 'This is usually temporary. The system will retry automatically.',
  },
};
```

## Manual Resolution Flow (Review C5)

When automation fails but the operator can resolve the issue manually (e.g., by calling the municipality):

```typescript
// src/application/resolve-job.ts
export async function resolveJob(
  jobId: string,
  referenceNumber?: string,
  note?: string,
  operatorId?: string,
): Promise<Job> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });

  if (job.status !== 'FAILED') {
    throw new ValidationError('Only FAILED jobs can be manually resolved', []);
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'MANUALLY_RESOLVED',
      result: { referenceNumber, note, resolvedManually: true },
      resolvedBy: operatorId,
      resolvedAt: new Date(),
      resolutionNote: note,
      completedAt: new Date(),
    },
  });

  await createJobEvent(jobId, 'SUCCESS_DETECTED',
    `Manually resolved by operator. Ref: ${referenceNumber || 'N/A'}`,
    { referenceNumber, note, resolvedBy: operatorId }
  );

  return updated;
}
```

## Notification on Failure

```typescript
// src/infrastructure/notification/email.ts
export async function sendFailureEmail(job: Job, error: AppError) {
  if (!config.notification.email.enabled) return;

  await transporter.sendMail({
    from: config.notification.email.from,
    to: config.notification.email.to,
    subject: `Fleet Job Failed: ${job.id} (${error.code})`,
    html: `
      <h2>Job Failed</h2>
      <p><strong>Job ID:</strong> ${job.id}</p>
      <p><strong>Site:</strong> ${job.site.name}</p>
      <p><strong>Issuer:</strong> ${job.issuer.name}</p>
      <p><strong>Report:</strong> ${(job.input as any).reportNumber}</p>
      <p><strong>Error:</strong> ${error.code} - ${error.message}</p>
      <p><strong>Attempts:</strong> ${job.attempts}/${job.maxAttempts}</p>
      <p><a href="${config.app.url}/jobs/${job.id}">View in Dashboard</a></p>
    `,
  });
}
```
