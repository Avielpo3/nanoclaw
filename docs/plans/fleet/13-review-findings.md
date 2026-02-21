# 13 - Design Review Findings (Consolidated)

Four review agents analyzed the design docs. This document consolidates all findings, organized by severity and affected component.

---

## Critical Findings

### C1. No "Clone & Edit" for Failed Jobs
**Source**: Product Manager, Product Pragmatist
**Affects**: 07-UI, 06-API, 02-Data Model

When a job fails, operators must create an entirely new job from scratch. This is the #1 operator workflow — a job fails because of a wrong report number or mismatched issuer, and the operator knows what to fix but has to re-enter everything.

**Resolution**:
- Add `POST /api/jobs/:id/clone` endpoint that creates a new job pre-filled with the original input
- Add `parentJobId` field to Job model for traceability
- Add "Clone & Edit" button on failed job detail page
- Pre-fill the New Job dialog with cloned input, let operator edit before submitting

### C2. No CAPTCHA Cost Tracking
**Source**: Product Manager, Product Pragmatist
**Affects**: 05-Browser Engine, 02-Data Model, 07-UI, 06-API

The system uses 2captcha (real money per solve) with zero cost tracking. Cannot answer: "How much did we spend this week?" or "What's the cost per successful appeal?"

**Resolution**:
- Log `captchaCost` in JobEvent data for `CAPTCHA_SOLVED` events (2captcha returns cost)
- Add `captchaCost` field to Job result JSON
- Add cost aggregation to `GET /api/stats` response
- Show cost trends on dashboard

### C3. No Appeal Deadline Awareness
**Source**: Product Manager
**Affects**: 02-Data Model, 03-Job System, 07-UI

Israeli parking ticket appeals have ~30-day legal deadlines. The queue is FIFO — a job submitted on day 28 is treated the same as day 2. Missing a deadline makes the entire appeal worthless.

**Resolution**:
- Add optional `ticketDate` / `deadline` field to appeal input schema
- Prioritize jobs by time-remaining when deadline is set
- Show "deadline approaching" badge on jobs with <5 days remaining
- Alert operators when jobs are at risk

### C4. PII Encryption at Rest
**Source**: Devil's Advocate
**Affects**: 02-Data Model, 11-Security

The `input` JSON field contains Israeli IDs, phone numbers, names — stored as plaintext in PostgreSQL. A database breach exposes all PII.

**Resolution**:
- Encrypt `input` and `validatedInput` JSON fields at the application layer before writing to DB
- Use AES-256-GCM with a key from environment variable
- Decrypt on read in the repository layer
- Add `ENCRYPTION_KEY` to `.env.example`

### C5. Dead End After MAX_RETRIES_REACHED
**Source**: Product Manager
**Affects**: 07-UI, 09-Error Handling

When retries exhaust, the notification email has a "View in Dashboard" link — then nothing. No guided next step, no actionable suggestion based on error type.

**Resolution**:
- Add operator-friendly error message mapping (technical code -> actionable text)
- Add "Resolve Manually" action: mark failed job as SUCCESS with manual reference number, or PERMANENTLY_FAILED with reason
- Add `MANUALLY_RESOLVED` to JobStatus enum
- Show suggested actions based on error code on job detail page

### C6. Duplicate Appeal Submission Risk
**Source**: Devil's Advocate
**Affects**: 06-API, 04-Site Adapters

The duplicate check uses `externalId` (optional). Without it, the same appeal can be submitted multiple times. Additionally, the TOCTOU race between duplicate check and insert allows concurrent duplicates.

**Resolution**:
- Add composite uniqueness check: `reportNumber + issuerId` (same report at same issuer = duplicate)
- Use a database unique constraint, not application-level check
- Add `@@unique([issuerId, input.reportNumber])` or use a hash field

---

## Important Findings

### I1. Architecture Over-Engineered for Phase 1
**Source**: Maintenance Lead, Product Manager
**Affects**: 01-Architecture

~110 files is too many for a 1-2 developer team. The 4-layer clean architecture adds boilerplate that won't pay off until the team grows.

**Resolution**:
- Flatten to ~60 files for Phase 1
- Merge `domain/entities/` into single file
- Merge all error classes into single `errors.ts`
- Remove `domain/events/` (event bus) — use direct function calls
- Keep the adapter pattern (genuinely valuable)

### I2. SystemLog Table + Logs Tab Redundant
**Source**: Maintenance Lead, Product Manager
**Affects**: 02-Data Model, 08-Logging, 07-UI

Two parallel logging systems (Pino + SystemLog DB table). For single-server deployment, `docker logs` + JobEvent audit trail covers 95% of debugging. SystemLog adds write overhead and requires its own cleanup cron.

**Resolution**:
- Defer SystemLog model and Logs tab to Phase 6
- Phase 1: use Pino stdout + JobEvent timeline as the debugging view
- Add a simple "Job Logs" sub-view on the job detail page that queries JobEvents

### I3. No Circuit Breaker for Site Outages
**Source**: Product Manager, Devil's Advocate
**Affects**: 03-Job System, 04-Site Adapters

If a site goes down, every queued job fails, burns retries, and hits FAILED. No automatic detection, no queue pausing.

**Resolution**:
- Track consecutive failures per site
- If N consecutive jobs fail with `SITE_UNAVAILABLE` or `TIMEOUT` (N=5), pause that site's queue
- Alert operator: "Metropark has been failing — queue paused"
- Auto-resume when periodic health check passes
- Add `circuitBreakerState` to Site model config

### I4. No Per-Issuer/City Success Rate
**Source**: Product Manager
**Affects**: 06-API, 07-UI

Stats show per-site breakdown but not per-issuer. Cannot answer "which city has the worst success rate?"

**Resolution**:
- Add `byIssuer` breakdown to `GET /api/stats` response
- Show sortable issuer table ranked by success rate on dashboard

### I5. No Failure Category Breakdown
**Source**: Product Manager
**Affects**: 06-API, 07-UI

"54 jobs failed" is not actionable. Need to know why: CAPTCHA, site down, report not found, etc.

**Resolution**:
- Add `byErrorCode` to stats response
- Show failure reason distribution on dashboard

### I6. VALIDATION_ERROR Jobs Are Orphaned
**Source**: Product Manager
**Affects**: 02-Data Model, 03-Job System

Jobs that fail validation are stored in DB but never queued and cannot be edited. Dead weight.

**Resolution**:
- Do NOT store validation failures as Job records
- Return 400 with validation errors and let the caller fix and resubmit
- Remove `VALIDATION_ERROR` from JobStatus enum

### I7. No Worker Pause/Resume
**Source**: Product Pragmatist
**Affects**: 07-UI, 03-Job System

No way to pause job processing from the UI during maintenance or when investigating issues.

**Resolution**:
- Add pause/resume toggle to Settings page
- Implement via pg-boss `offWork()` / re-subscribe

### I8. No Retry Efficiency Metric
**Source**: Product Manager
**Affects**: 06-API, 07-UI

No metric for how often retries succeed. Could be burning CAPTCHA credits on jobs that will never work.

**Resolution**:
- Track `succeededOnAttempt` distribution
- Show "first-attempt success rate" vs "overall success rate" on dashboard

### I9. Error Messages Not Actionable
**Source**: Product Manager
**Affects**: 07-UI, 09-Error Handling

Technical error messages like `CRAWLER_ERROR: Timeout waiting for selector` are meaningless to operators.

**Resolution**:
- Add operator-friendly message mapping in the UI:
  - `CRAWLER_ERROR` -> "The site's page structure was unexpected. May indicate a site update."
  - `CAPTCHA_ERROR` -> "Automated verification failed. Will retry automatically."
  - `REPORT_NOT_FOUND` -> "Report number not found on the site. Verify the number."
  - `BOT_DETECTED` -> "Site blocked our access. System will try different settings."
  - `SITE_UNAVAILABLE` -> "The municipal site is currently down."

### I10. Single Browser Instance SPOF
**Source**: Devil's Advocate
**Affects**: 05-Browser Engine

One shared browser instance — if it crashes or leaks memory, all jobs fail.

**Resolution**:
- Add browser health check before each job
- If browser is unresponsive, force-close and create new instance
- Add `isConnected()` check in `getBrowser()`
- Log browser restart events

### I11. CAPTCHA Token Expiry Race
**Source**: Devil's Advocate
**Affects**: 04-Site Adapters, 05-Browser Engine

reCAPTCHA tokens expire in ~2 minutes. If form-filling is slow, the token may expire before submission.

**Resolution**:
- Solve CAPTCHA as late as possible (after form filling, just before submit)
- Add token age check: if >90s since solve, re-solve before submitting
- Log CAPTCHA token age at submission time

### I12. Bulk Import Needs Error Handling Spec
**Source**: Product Manager
**Affects**: 06-API

`POST /api/jobs/bulk` is listed but not specified. What happens with partial validation failures?

**Resolution**:
- Return partial success response: `{ queued: [...ids], errors: [{ index, errors }] }`
- Never all-or-nothing
- Add `batchId` field to group bulk-submitted jobs

### I13. Settings Page Needs Guardrails
**Source**: Product Manager
**Affects**: 07-UI

Settings allows changing concurrency/retry values with no constraints. Operator could set concurrency to 100 or retry delay to 1 second.

**Resolution**:
- Worker concurrency: range 1-5 with warning text
- Retry delay: minimum 300 seconds
- Max retries: range 1-10
- Add explanatory text for each setting

---

## Nice-to-Have Findings

### N1. NotificationConfig Model Over-Designed
**Source**: Product Manager, Maintenance Lead
**Resolution**: Use environment variables for Phase 1. Build dynamic model in Phase 4.

### N2. Event Bus Premature
**Source**: Product Manager, Maintenance Lead
**Resolution**: Remove from Phase 1. Direct function calls are simpler.

### N3. No ROI Calculation
**Source**: Product Manager
**Resolution**: Add optional `ticketAmount` field. Calculate savings = successful_amounts - captcha_costs. Phase 4.

### N4. No Keyboard Navigation
**Source**: Product Manager
**Resolution**: Add arrow key navigation on job list, prev/next on detail page. Phase 3.

### N5. No Processing Time Distribution
**Source**: Product Manager
**Resolution**: Add P50/P90/P99 to stats API. Show on dashboard. Phase 4.

### N6. No Issuer Validation Tool
**Source**: Product Manager
**Resolution**: Build "Site Health Check" that verifies URLs and selectors. Phase 5.

### N7. Dev CAPTCHA Mock
**Source**: Maintenance Lead
**Resolution**: Add `MockCaptchaSolver` that returns instant tokens in development mode.

### N8. Docker-compose in Phase 1
**Source**: Maintenance Lead
**Resolution**: Move docker-compose.yml creation from Phase 6 to Phase 1. Essential for dev onboarding.

---

## Changes Applied to Design Docs

| Doc | Changes |
|-----|---------|
| 00-INDEX | Added doc 13 (this file) |
| 01-Architecture | Simplified directory structure, removed event bus |
| 02-Data Model | Added `parentJobId`, `deadline`, `batchId`, `MANUALLY_RESOLVED` status; removed `VALIDATION_ERROR` status; deferred SystemLog and NotificationConfig |
| 03-Job System | Added circuit breaker, deadline-based priority, worker pause/resume |
| 06-API Design | Added clone endpoint, bulk error spec, per-issuer stats, failure breakdown |
| 07-UI Dashboard | Added Clone & Edit, operator-friendly errors, manual resolution, settings guardrails, cost display |
| 08-Logging | Deferred SystemLog to Phase 6, simplified to Pino + JobEvent |
| 09-Error Handling | Added operator-friendly mapping, manual resolution flow, circuit breaker |
| 11-Security | Added PII encryption requirement |
| 12-Implementation Plan | Reordered: docker-compose to Phase 1, deferred Logs tab/SystemLog to Phase 6 |
