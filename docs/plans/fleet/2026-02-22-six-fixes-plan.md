# Six Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 6 issues: settings cleanup, test-to-dry-run rename, validation error detection, required field validation, attachment visibility, and stuck job detection.

**Architecture:** Incremental changes across Prisma schema, API routes, adapter code, and React UI. Each fix is independent — commit after each one.

**Tech Stack:** Next.js, Prisma, pg-boss, Playwright, Zod, SWR, shadcn/ui

---

### Task 1: Remove Circuit Breaker Tab from Global Settings

**Files:**
- Modify: `src/app/settings/page.tsx:31-60`
- Delete: `src/components/settings/circuit-breaker-settings.tsx`

**Step 1: Remove CB tab from settings page**

Edit `src/app/settings/page.tsx` — remove the CircuitBreakerSettings import (line 5) and remove the circuit-breaker TabsTrigger (line 34) and TabsContent (lines 43-48):

```tsx
// Remove this import:
import { CircuitBreakerSettings } from "@/components/settings/circuit-breaker-settings";

// Remove this TabsTrigger:
<TabsTrigger value="circuit-breaker">Circuit Breaker</TabsTrigger>

// Remove this TabsContent block:
<TabsContent value="circuit-breaker" className="mt-4">
  <CircuitBreakerSettings settings={settings} onSave={updateSettings} />
</TabsContent>
```

**Step 2: Delete the circuit breaker settings component**

Delete `src/components/settings/circuit-breaker-settings.tsx` entirely.

**Step 3: Verify build**

Run: `npm run build`
Expected: Successful build with no references to CircuitBreakerSettings.

**Step 4: Commit**

```bash
git add -A && git commit -m "fix: remove global circuit breaker settings tab

CB config lives exclusively per-site in the DB."
```

---

### Task 2: Rename "Test Runner" to "Dry Run" (Full Rename)

This is the largest change — touches DB schema, API routes, UI, hooks, middleware, and tests.

**Files:**
- Modify: `prisma/schema.prisma:114,154-177`
- Modify: `src/middleware.ts:31-34`
- Move: `src/app/api/test/` to `src/app/api/dry-run/`
- Move: `src/app/test/` to `src/app/dry-run/`
- Modify: `src/components/test/test-form.tsx` to rename to `src/components/dry-run/dry-run-form.tsx`
- Modify: `src/components/test/test-progress.tsx` to rename to `src/components/dry-run/dry-run-progress.tsx`
- Modify: `src/hooks/use-test.ts` to rename to `src/hooks/use-dry-run.ts`
- Modify: `src/components/layout/sidebar.tsx:26`
- Modify: `src/app/api/dashboard/route.ts:15`
- Modify: `src/components/jobs/job-detail.tsx` (badge dry runs)
- Modify: All test files referencing testMode
- Modify: `src/lib/init.ts` (any testMode references)
- Modify: `src/app/api/appeals/route.ts` (testMode references)

**Step 1: Update Prisma schema**

In `prisma/schema.prisma`, rename `testMode` to `dryRun` on line 114:

```prisma
  dryRun           Boolean   @default(false)
```

Add `STUCK_DETECTED` to `JobEventType` enum (line 176, needed for Task 6):

```prisma
  STUCK_DETECTED
```

Add stuck fields to Job model (after line 132):

```prisma
  stuckAt           DateTime?
  stuckReason       String?
```

**Step 2: Push schema and regenerate**

Run: `npm run db:push && npm run prisma:generate`

Note: User confirmed all data is junk — no migration needed, `db:push` will handle it.

**Step 3: Rename API routes**

Move directory: `src/app/api/test/` to `src/app/api/dry-run/`

In `src/app/api/dry-run/run/route.ts`:
- Change logger name: `createChildLogger('api:dry-run')`
- Change `testMode: true` to `dryRun: true` (line 92)
- Change event message: `'Dry run created for...'` (line 97)
- Change event data: `{ dryRun: true, ...}` (line 98)
- Change log message: `'Dry run created'` (line 120)

In `src/app/api/dry-run/[jobId]/progress/route.ts`:
- Change `job.testMode` to `job.dryRun` (line 15, 39)
- Change error message: `'NOT_DRY_RUN'` / `'Job is not a dry run'` (lines 41-42)

**Step 4: Update middleware**

In `src/middleware.ts`, change line 31-34:

```typescript
  // Dry run endpoints bypass auth (developer tool)
  if (pathname.startsWith('/api/dry-run/')) {
    return addCorsAndCorrelation(request, NextResponse.next());
  }
```

**Step 5: Rename hooks**

Rename `src/hooks/use-test.ts` to `src/hooks/use-dry-run.ts`:

```typescript
export function useDryRunProgress(jobId: string | null) {
  return useSWR(
    jobId ? `/api/dry-run/${jobId}/progress` : null,
    fetcher,
    { refreshInterval: 2000, revalidateOnFocus: false },
  );
}
```

Keep `useSiteIssuers` in the same file (it is unrelated to the rename but lives here).

**Step 6: Rename UI page and components**

Move `src/app/test/` to `src/app/dry-run/`

Rename `src/components/test/` to `src/components/dry-run/`:
- `test-form.tsx` to `dry-run-form.tsx` (rename component `TestForm` to `DryRunForm`)
- `test-progress.tsx` to `dry-run-progress.tsx` (rename component `TestProgress` to `DryRunProgress`, use `useDryRunProgress` hook)

In `src/app/dry-run/page.tsx`:
- Change imports to `@/components/dry-run/dry-run-form` and `@/components/dry-run/dry-run-progress`
- Change title: `"Dry Run"`, description: `"Run a site appeal flow without submitting — verify the crawler works"`
- Change fetch URL: `/api/dry-run/run`
- Rename component: `DryRunPage`

**Step 7: Update sidebar nav**

In `src/components/layout/sidebar.tsx` line 26, change:

```typescript
{ href: "/dry-run", label: "Dry Run", icon: FlaskConical },
```

**Step 8: Update dashboard API**

In `src/app/api/dashboard/route.ts` line 15, change:

```typescript
const excludeDryRun = { dryRun: false };
```

And rename all `excludeTest` to `excludeDryRun` in the file.

**Step 9: Update all other testMode references**

Grep for remaining `testMode` across the codebase and update:
- `src/app/api/appeals/route.ts` — any `testMode` references
- `src/lib/init.ts` — any `testMode` references
- `src/adapters/metropark/adapter.ts` line 95 — change log message: `'Stopped before submit (dry run)'`

**Step 10: Update tests**

Rename test files:
- `tests/unit/api/test-progress.test.ts` to `tests/unit/api/dry-run-progress.test.ts`
- Update all `testMode` to `dryRun` in test files
- Update all `/api/test/` to `/api/dry-run/` in test files

**Step 11: Verify**

Run: `npm run build && npm run test`
Expected: All pass.

**Step 12: Commit**

```bash
git add -A && git commit -m "refactor: rename test runner to dry run

Full rename: DB column (testMode to dryRun), API routes (/api/test to /api/dry-run),
UI pages, components, hooks, sidebar, middleware. All data deleted (junk)."
```

---

### Task 3: Metropark Validation Error Detection

**Files:**
- Modify: `src/adapters/metropark/detection.ts`
- Modify: `src/adapters/metropark/flow.ts:161,203`
- Modify: `src/adapters/metropark/selectors.ts:62-71`
- Test: `tests/unit/adapters/metropark/detection.test.ts` (create)

**Step 1: Run a dry run with bad data to discover real DOM error indicators**

Use the dry run UI (after Task 2) or directly via API:

```bash
curl -X POST http://localhost:3000/api/dry-run/run \
  -H 'Content-Type: application/json' \
  -d '{"reportNumber":"99999999","vehicleNumber":"99999999","idNumber":"000","stopBeforeSubmit":true}'
```

Wait for completion, then inspect the screenshots and page content. Look for:
- `span[data-valmsg-for]` elements with non-empty text (ASP.NET MVC pattern)
- `span.glyphicon-remove` (already in `RESULT.ERROR_ICON`)
- Any `.field-validation-error` classes
- Alert/error divs with Hebrew error text

**IMPORTANT:** The exact selectors MUST come from inspecting the real page. The existing `VALIDATION_ERRORS` in `selectors.ts` may be incomplete — they only cover file upload fields. There are likely `data-valmsg-for` spans for every form field.

**Step 2: Update selectors based on evidence**

After inspecting the real DOM, update `src/adapters/metropark/selectors.ts` `VALIDATION_ERRORS` object with the actual selectors found.

Also add a generic selector to catch ALL validation messages:

```typescript
export const VALIDATION_ERRORS = {
  // Generic — catches all ASP.NET MVC validation messages
  ALL: 'span[data-valmsg-for]',
  // ... keep specific ones if confirmed from DOM inspection
} as const;
```

**Step 3: Write failing test for detectValidationErrors**

Create `tests/unit/adapters/metropark/detection.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectValidationErrors } from '@/adapters/metropark/detection';

describe('detectValidationErrors', () => {
  it('returns empty array when no validation errors found', () => {
    // Use mock Page that returns no validation spans
    // Exact implementation depends on DOM evidence from Step 1
  });

  it('returns field errors when validation spans have text', () => {
    // Exact assertions depend on DOM evidence
  });
});
```

Note: Exact test content depends on what the real DOM shows in Step 1.

**Step 4: Implement detectValidationErrors**

Add to `src/adapters/metropark/detection.ts`:

```typescript
import type { Page } from 'playwright';

export async function detectValidationErrors(page: Page): Promise<{ field: string; message: string }[]> {
  // Query all data-valmsg-for spans
  const errors = await page.$$eval('span[data-valmsg-for]', (spans) =>
    spans
      .filter((span) => span.textContent?.trim())
      .map((span) => ({
        field: span.getAttribute('data-valmsg-for') || 'unknown',
        message: span.textContent?.trim() || '',
      }))
  );

  // Also check for glyphicon-remove error icon
  const errorIcon = await page.$('span.glyphicon-remove');
  if (errorIcon) {
    const parentText = await errorIcon.evaluate((el) => el.parentElement?.textContent?.trim() || '');
    if (parentText) {
      errors.push({ field: 'general', message: parentText });
    }
  }

  return errors;
}
```

**Step 5: Call detectValidationErrors in flow**

In `src/adapters/metropark/flow.ts`, after `fillAppealForm` (around line 161, after screenshot):

```typescript
// Check for validation errors after filling form
const formErrors = await detection.detectValidationErrors(page);
if (formErrors.length > 0) {
  await this.screenshot(page, 'validation-errors');
  this.log.warn({ errors: formErrors }, 'Form validation errors detected');
  throw new ValidationError(formErrors);
}
```

Also after `submitAppeal` (around line 203, after the `after-submit` screenshot):

```typescript
// Check for validation errors after submit
const submitErrors = await detection.detectValidationErrors(page);
if (submitErrors.length > 0) {
  await this.screenshot(page, 'submit-validation-errors');
  this.log.warn({ errors: submitErrors }, 'Post-submit validation errors detected');
  throw new ValidationError(submitErrors);
}
```

Import the `ValidationError` from domain errors (create if needed) — it should have code `VALIDATION_ERROR`.

**Step 6: Run tests**

Run: `npm run test`
Expected: All pass.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: detect form validation errors in Metropark adapter

Checks data-valmsg-for spans and glyphicon-remove after form fill and submit.
Fails job with VALIDATION_ERROR if site-side validation errors found."
```

---

### Task 4: Required Field Validation (API + Adapter)

**Files:**
- Modify: `src/app/api/dry-run/run/route.ts:10-28`
- Modify: `src/adapters/metropark/flow.ts:124`
- Modify: `src/adapters/metropark/types.ts`
- Test: `tests/unit/adapters/metropark/validation.test.ts` (create)

**Step 1: Write failing test for required field validation**

Create `tests/unit/adapters/metropark/validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateMetroparkInput } from '@/adapters/metropark/validation';

describe('validateMetroparkInput', () => {
  it('passes with all required parking fields', () => {
    const input = {
      reportNumber: '12345678',
      vehicleNumber: '12345678',
      appealType: 'parking',
      firstName: 'test',
      lastName: 'test',
      phone: '0544757841',
      email: 'test@test.com',
      city: 'test',
      street: 'test',
      driverId: '123456789',
      driverFirstName: 'test',
      driverLastName: 'test',
    };
    expect(() => validateMetroparkInput(input)).not.toThrow();
  });

  it('throws for missing required parking field', () => {
    const input = {
      reportNumber: '12345678',
      // vehicleNumber missing
      appealType: 'parking',
      firstName: 'test',
      lastName: 'test',
    };
    expect(() => validateMetroparkInput(input)).toThrow();
  });

  it('throws for empty string required field', () => {
    const input = {
      reportNumber: '',
      vehicleNumber: '12345678',
      appealType: 'parking',
      firstName: 'test',
      lastName: 'test',
      phone: '0544757841',
      email: 'test@test.com',
      city: 'test',
      street: 'test',
      driverId: '123456789',
      driverFirstName: 'test',
      driverLastName: 'test',
    };
    expect(() => validateMetroparkInput(input)).toThrow();
  });

  it('requires idNumber for enforcement appeals', () => {
    const input = {
      reportNumber: '12345678',
      idNumber: '',
      appealType: 'enforcement',
      firstName: 'test',
      lastName: 'test',
      phone: '0544757841',
      email: 'test@test.com',
      city: 'test',
      street: 'test',
      driverId: '123456789',
      driverFirstName: 'test',
      driverLastName: 'test',
    };
    expect(() => validateMetroparkInput(input)).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/adapters/metropark/validation.test.ts`
Expected: FAIL — `validateMetroparkInput` not found.

**Step 3: Implement validateMetroparkInput**

Create `src/adapters/metropark/validation.ts`:

```typescript
import { z } from 'zod';

const nonEmpty = z.string().min(1);

const baseFields = {
  reportNumber: nonEmpty,
  firstName: nonEmpty,
  lastName: nonEmpty,
  phone: nonEmpty,
  email: nonEmpty,
  city: nonEmpty,
  street: nonEmpty,
  driverId: nonEmpty,
  driverFirstName: nonEmpty,
  driverLastName: nonEmpty,
};

const ParkingInputSchema = z.object({
  ...baseFields,
  appealType: z.literal('parking'),
  vehicleNumber: nonEmpty,
});

const EnforcementInputSchema = z.object({
  ...baseFields,
  appealType: z.literal('enforcement'),
  idNumber: nonEmpty,
});

const AutoInputSchema = z.object({
  ...baseFields,
  appealType: z.literal('auto'),
  vehicleNumber: nonEmpty,
  idNumber: nonEmpty,
});

const MetroparkInputSchema = z.discriminatedUnion('appealType', [
  ParkingInputSchema,
  EnforcementInputSchema,
  AutoInputSchema,
]);

export function validateMetroparkInput(input: Record<string, unknown>): void {
  MetroparkInputSchema.parse(input);
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/adapters/metropark/validation.test.ts`
Expected: PASS

**Step 5: Call validation in adapter**

In `src/adapters/metropark/adapter.ts`, add at the top of `appeal()` method (around line 48):

```typescript
import { validateMetroparkInput } from './validation';

// Inside appeal():
validateMetroparkInput(input);
```

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add required field validation for Metropark adapter

Zod schema validates all required fields before form filling.
Validates at adapter level (belt and suspenders with API layer)."
```

---

### Task 5: Attachment Visibility in Job Detail

**Files:**
- Modify: `src/adapters/metropark/flow.ts:166-183`
- Modify: `src/adapters/metropark/adapter.ts`
- Modify: `src/components/jobs/job-detail.tsx:269-277`
- Modify: `src/domain/types/job.ts` (JobResult type)

**Step 1: Return attachment metadata from uploadDocuments**

In `src/adapters/metropark/flow.ts`, change `uploadDocuments` to return metadata:

```typescript
interface AttachmentMeta {
  field: string;
  fileName: string;
  isBlankFallback: boolean;
}

async uploadDocuments(page: Page, files: string[]): Promise<AttachmentMeta[]> {
  this.log.info({ count: files.length }, 'Uploading documents');
  const selectors = [FILE_UPLOADS.DOCUMENTS, FILE_UPLOADS.ID_DOCUMENT];
  const attachments: AttachmentMeta[] = [];

  for (let i = 0; i < selectors.length; i++) {
    const selector = selectors[i];
    const input = await page.$(selector);
    if (!input) {
      this.log.warn({ selector }, 'Upload input not found, skipping');
      continue;
    }
    if (files[i]) {
      await input.setInputFiles(files[i]);
      attachments.push({
        field: selector,
        fileName: files[i].split('/').pop() || files[i],
        isBlankFallback: false,
      });
    } else {
      await this.uploadBlankPdf(page, selector);
      attachments.push({
        field: selector,
        fileName: 'blank.pdf',
        isBlankFallback: true,
      });
    }
  }

  return attachments;
}
```

**Step 2: Include attachments in JobResult**

In `src/adapters/metropark/adapter.ts`, capture the return value:

```typescript
const attachments = await flow.uploadDocuments(page, data.documentUrl ? [data.documentUrl] : []);
```

Include in the returned `JobResult`:

```typescript
return {
  referenceNumber: appealResult.referenceNumber,
  message: appealResult.message,
  screenshots: flow.screenshots,
  attachments,
};
```

Also update the `JobResult` type in `src/domain/types/job.ts` to include `attachments?`.

**Step 3: Show attachments in job detail UI**

In `src/components/jobs/job-detail.tsx`, add an Attachments section after Screenshots (around line 277):

```tsx
{/* Attachments */}
{job.result?.attachments && job.result.attachments.length > 0 && (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-sm font-medium">Attachments</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-2">
        {job.result.attachments.map((att: { field: string; fileName: string; isBlankFallback: boolean }, i: number) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="font-mono text-xs text-muted-foreground">{att.field.replace('#txtFile', '')}</span>
            <span>{att.fileName}</span>
            {att.isBlankFallback && (
              <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">
                blank fallback
              </Badge>
            )}
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
)}
```

Update the `JobData` interface to include `attachments` in `result`.

**Step 4: Verify build**

Run: `npm run build`
Expected: Passes.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: show attachment metadata in job detail

Track which files were uploaded vs blank PDF fallback.
Display in job detail UI with clear indicators."
```

---

### Task 6: Smart Stuck Job Detection + Handling

**Files:**
- Modify: `prisma/schema.prisma` (already done in Task 2 Step 1)
- Create: `src/infrastructure/queue/stuck-detector.ts`
- Modify: `src/infrastructure/queue/job-scheduler.ts`
- Create: `src/app/api/jobs/[id]/re-enqueue/route.ts`
- Create: `src/app/api/jobs/[id]/cancel/route.ts`
- Modify: `src/app/api/dashboard/route.ts`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/components/jobs/job-detail.tsx`
- Test: `tests/unit/infrastructure/stuck-detector.test.ts` (create)

**Step 1: Write failing test for stuck detection**

Create `tests/unit/infrastructure/stuck-detector.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectStuckJobs } from '@/infrastructure/queue/stuck-detector';

// Mock prisma
vi.mock('@/infrastructure/db', () => ({
  prisma: {
    job: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    jobEvent: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

describe('detectStuckJobs', () => {
  it('flags PENDING job with scheduledFor in the past', async () => {
    // Mock a PENDING job with scheduledFor 10 minutes ago
    // Assert stuckAt and stuckReason are set
  });

  it('flags PENDING job with null scheduledFor as orphaned', async () => {
    // Mock a PENDING job with scheduledFor = null
  });

  it('flags QUEUED job older than 10 minutes', async () => {
    // Mock a QUEUED job with updatedAt 15 minutes ago
  });

  it('flags PROCESSING job with no recent events', async () => {
    // Mock a PROCESSING job with updatedAt 10 minutes ago, no recent events
  });

  it('does not flag fresh jobs', async () => {
    // Mock a QUEUED job updated 1 minute ago
    // Assert not flagged
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/infrastructure/stuck-detector.test.ts`
Expected: FAIL

**Step 3: Implement stuck detector**

Create `src/infrastructure/queue/stuck-detector.ts`:

```typescript
import { prisma } from '@/infrastructure/db';
import { createChildLogger } from '@/infrastructure/logger';

const log = createChildLogger('stuck-detector');

const PENDING_THRESHOLD_MS = 5 * 60 * 1000;    // 5 minutes
const QUEUED_THRESHOLD_MS = 10 * 60 * 1000;     // 10 minutes
const PROCESSING_THRESHOLD_MS = 5 * 60 * 1000;  // 5 minutes

export async function detectStuckJobs(): Promise<void> {
  const now = new Date();

  // 1. PENDING with scheduledFor in the past or null
  const stuckPending = await prisma.job.findMany({
    where: {
      status: 'PENDING',
      stuckAt: null,
      OR: [
        { scheduledFor: { lt: new Date(now.getTime() - PENDING_THRESHOLD_MS) } },
        { scheduledFor: null },
      ],
    },
  });

  for (const job of stuckPending) {
    const reason = job.scheduledFor
      ? `Scheduler missed: scheduledFor was ${job.scheduledFor.toISOString()}`
      : 'Orphaned: no scheduledFor set';
    await markStuck(job.id, reason);
  }

  // 2. QUEUED too long
  const stuckQueued = await prisma.job.findMany({
    where: {
      status: 'QUEUED',
      stuckAt: null,
      updatedAt: { lt: new Date(now.getTime() - QUEUED_THRESHOLD_MS) },
    },
  });

  for (const job of stuckQueued) {
    await markStuck(job.id, 'Queued for over 10 minutes - pg-boss may not have picked it up');
  }

  // 3. PROCESSING with no recent activity
  const stuckProcessing = await prisma.job.findMany({
    where: {
      status: 'PROCESSING',
      stuckAt: null,
      updatedAt: { lt: new Date(now.getTime() - PROCESSING_THRESHOLD_MS) },
    },
  });

  for (const job of stuckProcessing) {
    const recentEvent = await prisma.jobEvent.findFirst({
      where: {
        jobId: job.id,
        createdAt: { gt: new Date(now.getTime() - PROCESSING_THRESHOLD_MS) },
      },
    });

    if (!recentEvent) {
      await markStuck(job.id, 'Processing with no recent activity - worker may have crashed');
    }
  }
}

async function markStuck(jobId: string, reason: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { stuckAt: new Date(), stuckReason: reason },
  });

  await prisma.jobEvent.create({
    data: {
      jobId,
      type: 'STUCK_DETECTED',
      message: reason,
    },
  });

  log.warn({ jobId, reason }, 'Job marked as stuck');
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/infrastructure/stuck-detector.test.ts`
Expected: PASS

**Step 5: Wire into job scheduler**

In `src/infrastructure/queue/job-scheduler.ts`, add import and re-export:

```typescript
import { detectStuckJobs } from './stuck-detector';
export { detectStuckJobs };
```

Then in `src/lib/init.ts` (where the scheduler interval is set), add `detectStuckJobs` to run on the same interval.

**Step 6: Create re-enqueue API route**

Create `src/app/api/jobs/[id]/re-enqueue/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/db';
import { getBoss } from '@/infrastructure/queue/boss';
import { QUEUES } from '@/infrastructure/queue/types';
import { createChildLogger } from '@/infrastructure/logger';

const log = createChildLogger('api:jobs:re-enqueue');

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } },
      { status: 404 },
    );
  }

  const terminal = ['SUCCESS', 'CANCELLED', 'MANUALLY_RESOLVED'];
  if (terminal.includes(job.status)) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_STATE', message: `Cannot re-enqueue ${job.status} job` } },
      { status: 400 },
    );
  }

  const boss = getBoss();
  await boss.send(QUEUES.APPEAL, { jobId: job.id, siteId: job.siteId }, {
    priority: job.priority,
  });

  await prisma.job.update({
    where: { id },
    data: { status: 'QUEUED', stuckAt: null, stuckReason: null },
  });

  await prisma.jobEvent.create({
    data: { jobId: id, type: 'RETRIED', message: 'Re-enqueued by operator (was stuck)' },
  });

  log.info({ id }, 'Stuck job re-enqueued');
  return NextResponse.json({ success: true });
}
```

**Step 7: Create cancel API route**

Create `src/app/api/jobs/[id]/cancel/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/db';
import { createChildLogger } from '@/infrastructure/logger';

const log = createChildLogger('api:jobs:cancel');

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Job not found' } },
      { status: 404 },
    );
  }

  const terminal = ['SUCCESS', 'CANCELLED', 'MANUALLY_RESOLVED'];
  if (terminal.includes(job.status)) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_STATE', message: `Cannot cancel ${job.status} job` } },
      { status: 400 },
    );
  }

  await prisma.job.update({
    where: { id },
    data: { status: 'CANCELLED', stuckAt: null, stuckReason: null },
  });

  await prisma.jobEvent.create({
    data: { jobId: id, type: 'CANCELLED', message: 'Cancelled by operator (was stuck)' },
  });

  log.info({ id }, 'Stuck job cancelled');
  return NextResponse.json({ success: true });
}
```

**Step 8: Add stuck jobs to dashboard API**

In `src/app/api/dashboard/route.ts`, add a query for stuck jobs to the Promise.all:

```typescript
const stuckJobs = await prisma.job.findMany({
  where: { stuckAt: { not: null }, dryRun: false },
  orderBy: { stuckAt: 'asc' },
  take: 10,
  include: { site: true },
});
```

Include in response:

```typescript
stuckJobs: stuckJobs.map((j) => ({
  id: j.id,
  status: j.status,
  stuckAt: j.stuckAt?.toISOString(),
  stuckReason: j.stuckReason,
  site: j.site.slug,
  createdAt: j.createdAt.toISOString(),
})),
```

**Step 9: Add Stuck Jobs section to dashboard UI**

In `src/app/dashboard/page.tsx`, after the failed jobs section (around line 100), add:

```tsx
{dashboard.stuckJobs && dashboard.stuckJobs.length > 0 && (
  <div className="rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 p-6">
    <h2 className="text-lg font-medium mb-4 text-yellow-800 dark:text-yellow-200">
      Stuck Jobs
    </h2>
    <div className="space-y-3">
      {dashboard.stuckJobs.map((j: { id: string; status: string; stuckAt: string; stuckReason: string; site: string }) => (
        <div key={j.id} className="flex items-center justify-between rounded-lg border border-yellow-200 dark:border-yellow-800 bg-white dark:bg-background p-3">
          <div>
            <span className="text-sm font-mono">{j.id.slice(0, 8)}</span>
            <Badge className="ml-2 text-xs" variant="outline">{j.status}</Badge>
            <span className="mx-2 text-muted-foreground">-</span>
            <span className="text-sm">{j.stuckReason}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await fetch(`/api/jobs/${j.id}/re-enqueue`, { method: 'POST' });
                mutate();
              }}
              className="text-sm text-primary hover:underline"
            >
              Re-enqueue
            </button>
            <button
              onClick={async () => {
                await fetch(`/api/jobs/${j.id}/cancel`, { method: 'POST' });
                mutate();
              }}
              className="text-sm text-destructive hover:underline"
            >
              Cancel
            </button>
            <a href={`/jobs/${j.id}`} className="text-sm text-primary hover:underline">View</a>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

**Step 10: Add stuck warning to job detail**

In `src/components/jobs/job-detail.tsx`, add a stuck banner after the PENDING banner (around line 134):

```tsx
{job.stuckAt && (
  <div className="rounded-md bg-yellow-50 dark:bg-yellow-950 border border-yellow-300 dark:border-yellow-700 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
    <strong>Stuck:</strong> {job.stuckReason}
    <span className="ml-2 text-xs text-muted-foreground">
      since {formatDistanceToNow(new Date(job.stuckAt), { addSuffix: true })}
    </span>
  </div>
)}
```

Update `JobData` interface to include `stuckAt?: string` and `stuckReason?: string`.

**Step 11: Verify**

Run: `npm run build && npm run test`
Expected: All pass.

**Step 12: Commit**

```bash
git add -A && git commit -m "feat: smart stuck job detection with re-enqueue/cancel

Periodic sweep detects stuck PENDING/QUEUED/PROCESSING jobs.
Dashboard shows stuck jobs section with Re-enqueue and Cancel actions.
Job detail shows stuck warning banner."
```

---

## Execution Order

Tasks should be executed in order (1 through 6) because:
- Task 2 (rename) changes file paths that Tasks 3-6 reference
- Task 3 (validation detection) requires a running app with dry run (from Task 2)
- Task 2 also adds the schema fields needed by Task 6

## Total Files Changed

Around 25 files modified/created/moved across 6 tasks.
