# Six Fixes Design

Date: 2026-02-22

## Overview

Six issues to address across settings, naming, validation, attachments, and job health.

---

## 1. Settings Cleanup — Remove Global Circuit Breaker

**Problem:** Global settings page has a Circuit Breaker tab that writes to in-memory store but doesn't persist. Per-site CB config lives in DB (`Site.cbFailureThreshold`, `cbResetTimeout`). This is confusing.

**Solution:**
- Remove the "Circuit Breaker" tab from `/settings` page
- CB config remains exclusively per-site in the DB, edited from site detail pages
- Global settings keeps only truly global items: `maxConcurrentJobs`, `defaultEmail`, `defaultPhone`, `captchaProvider`, `piiEncryptionEnabled`

---

## 2. Rename "Test Runner" → "Dry Run"

**Problem:** "Test" is overloaded — vitest unit/integration tests vs the UI feature that crawls a real site without submitting. Confusing when discussing both.

**Solution — full rename including DB:**
- UI: sidebar, page title, buttons → "Dry Run"
- API routes: `/api/test/*` → `/api/dry-run/*`
- DB: `testMode` column → `dryRun` (Prisma migration)
- Code: rename all `testMode` references to `dryRun` in services, hooks, components
- Dashboard continues excluding dry runs from stats
- Job detail badges dry runs distinctly from real appeals

---

## 3. Form Validation Error Detection (Metropark)

**Problem:** Crawler reports SUCCESS but screenshots show site-side validation errors (e.g., invalid ID number). The adapter doesn't detect inline form validation errors.

**Solution:**
1. **Run a dry run with intentionally bad data** to capture the actual DOM error indicators
2. **Inspect the real page** to find exact selectors and patterns (don't guess — `selectors.ts` has `VALIDATION_ERRORS` and `RESULT.ERROR_ICON` already defined but they may be incomplete or wrong)
3. **Add `detectValidationErrors()` to `detection.ts`** based on actual DOM evidence
4. **Call in flow** after `fillAppealForm` and after `submitAppeal` — if errors found, screenshot + fail with `VALIDATION_ERROR` code and field-specific messages

Note: `selectors.ts` already has `VALIDATION_ERRORS` (file upload `data-valmsg-for` spans) and `RESULT.ERROR_ICON` (`span.glyphicon-remove`) — these need to be verified against real pages before use.

---

## 4. Required Field Validation (Belt & Suspenders)

**Problem:** Adapter fills missing fields with defaults (houseNumber='1', email=default) which can cause silent failures on the site.

**Solution — validate at two layers:**
- **API layer:** Zod schema validation before job creation. Reject with 400 + field-specific errors if required fields are missing.
- **Adapter layer:** Assert required fields non-empty before filling forms. Throw `VALIDATION_ERROR` if missing.
- Required fields for Metropark: `reportNumber`, `vehicleNumber` or `ownerId` (by appeal type), `firstName`, `lastName`, `phone`, `email`, `city`, `street`, `driverId`, `driverFirstName`, `driverLastName`

---

## 5. Attachment Visibility

**Problem:** Job detail UI doesn't show what files were attached or whether blank PDF fallback was used.

**Solution:**
- During adapter execution, log attachment details as a `JobEvent` (file names, sizes, or "blank PDF fallback")
- Store attachment metadata in `job.result.attachments[]`: `{ field: string, fileName: string, size: number, isBlankFallback: boolean }`
- Job detail UI: show "Attachments" section listing each file with clear indicator for blank PDF fallbacks

---

## 6. Smart Stuck Job Detection + Handling

**Problem:** A stale/orphaned PENDING job appears on dashboard with no explanation or way to handle it.

**Solution:**

### Detection Rules

| Status | Condition | Reason |
|--------|-----------|--------|
| PENDING | `scheduledFor < now - 5min` | Scheduler missed it |
| PENDING | `scheduledFor IS NULL` | Orphaned — no trigger scheduled |
| QUEUED | `updatedAt < now - 10min` | pg-boss didn't pick it up |
| PROCESSING | `updatedAt < now - 5min` + no recent JobEvent | Worker crashed/hung |

### Schema Changes

Add to `Job` model:
- `stuckAt DateTime?` — when the job was flagged as stuck
- `stuckReason String?` — human-readable reason

### Periodic Sweep

Run alongside `processReadyJobs` in the job scheduler (every minute). When a job matches a stuck rule:
1. Set `stuckAt = now`, `stuckReason = "<reason>"`
2. Create `JobEvent` of type `STUCK_DETECTED`

Clear `stuckAt`/`stuckReason` if the job transitions out of the stuck state naturally.

### UI

- Dashboard: "Stuck Jobs" section (like "Failed Jobs Requiring Attention") showing stuck jobs with reason and age
- Job detail: warning banner when `stuckAt` is set
- Actions: **Re-enqueue** (reset to QUEUED, clear stuck fields, send to pg-boss) or **Cancel** (set CANCELLED)

### API

- `POST /api/jobs/:id/re-enqueue` — re-enqueue a stuck job
- `POST /api/jobs/:id/cancel` — cancel a stuck job
