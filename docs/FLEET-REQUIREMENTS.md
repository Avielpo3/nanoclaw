# Fleet Project - Requirements Document

> Extracted from design meeting between Aviel, Eran, and Shay (joined later).

## Product Overview

**Fleet** is an automated traffic/parking ticket appeal system. It replaces manual human work of submitting appeals (עירורים) on traffic and parking tickets to various Israeli municipalities through their online platforms.

**Business model**: Per-vehicle fee (~5 NIS/vehicle). Fleet companies with thousands of vehicles generate high volume.

**Scale**: Low to medium. Not high-scale initially.

---

## Core Flow

1. Receive appeal request (via API or cron trigger from Fleet system)
2. Save to database with all details
3. Job enters processing queue (cron-based)
4. Worker picks up job, opens Playwright browser
5. Navigate to the correct municipality platform
6. Fill in appeal form with provided data
7. Submit the appeal
8. Capture success confirmation (reference number if available)
9. Update job status (success/fail)
10. On failure: retry mechanism with configurable attempts

---

## Architecture

### Tech Stack
- **Language**: TypeScript
- **ORM**: Prisma (recommended by Eran)
- **Database**: PostgreSQL
- **Browser Automation**: Playwright (with anti-bot stealth)
- **CAPTCHA Solving**: 2captcha (already have account/integration)

### Job System (Generic)

The job system must be **fully generic** - it knows nothing about crawlers or specific platforms. It's a reusable job scheduler/executor.

| Requirement | Detail |
|-------------|--------|
| Job identity | Each job has a name, unique ID, and type |
| Job status | `waiting` → `in_progress` → `success` / `failed` |
| Storage | PostgreSQL with a `json` field for raw/dynamic data |
| Processing | Cron-based worker runs every ~10 minutes |
| Retry | Failed jobs are retried (configurable max attempts) |
| Re-trigger | Ability to manually reset a job to `waiting` to re-run it |
| Concurrency control | Per-job-type config: can run concurrently or not |
| Cron jobs | System should also support scheduled/cron-triggered jobs (not just API-triggered) |
| Input validation | Validate all inputs before processing |
| Configurability | Per-job-type settings (interval, concurrency, max retries, etc.) |

### API

- Single generic API endpoint: receives job name/type + parameters
- Saves to database immediately (data never lost)
- Returns acknowledgment
- **Not synchronous execution** - API just enqueues, worker processes later

### Worker / Cron

- Runs on interval (e.g., every 10 minutes)
- Picks up jobs with status `waiting`
- Must NOT run concurrently on the same job (guard against race conditions)
- On success: update status to `success`, store result/timestamp
- On failure: increment retry count, if under max retries → back to `waiting`, otherwise → `failed`
- Failed jobs can be manually re-queued by updating status in DB

---

## Platform Integrations

### Overview

Each municipality works with a specific platform provider. The mapping is:

| Platform | Description | Priority |
|----------|-------------|----------|
| **Metropark (מטרופארק)** | Largest provider, many municipalities | Start here |
| **Lola (לולה)** | ~10-20 municipalities | Second |
| **Mitar (מיתר)** | Another provider | Third |

The `issuer` table in the DB maps each municipality to its platform.

### Metropark - Detailed Spec

**URL Structure**:
- Parking appeals: URL contains `parking` path + `authority_id` query parameter
- Enforcement/supervision appeals: URL contains `supervision` path + `authority_id` query parameter
- The `authority_id` is a hidden parameter identifying the municipality (e.g., Bat Yam = `78`)

**Appeal Types**:
- `parking` - parking tickets (חנייה)
- `enforcement/supervision` - enforcement tickets (פיקוח)
- If type unknown: try parking first, if fails try enforcement

**Form Fields** (received from Fleet):
- Report number (מספר דוח)
- Vehicle number (מספר רכב)
- ID number (תעודת זהות)
- Full name (שם פרטי, שם משפחה)
- Phone number
- Email → use company default (e.g., `moni@rodprotect.co.il`)
- Address fields (street, house number, city)
- Appeal reason/text (נימוקים) → default: "מבקש להערר" if not provided
- **Two document uploads (mandatory)**:
  - Document 1: File received from Fleet (if provided)
  - Document 2: Blank/empty PDF (always - it's required by the form but can be empty)

**CAPTCHA Handling**:
- Forms have reCAPTCHA ("I'm not a robot")
- Use **2captcha** service to solve
- Flow: extract site key from page → send to 2captcha API → receive token → inject token into the page
- 2captcha integration already exists in existing codebase (v1/v2)

**Success Detection**:
- Look for text: "הבקשה הוגשה בהצלחה" (request submitted successfully)
- Capture reference/tracking number (מספר פנייה) if displayed
- Store timestamp of successful submission

**Testing**:
- Start with **Bat Yam (בת ים)** - authority_id: `78` (or `78` area)
- Ori/Eran will provide test report numbers
- After one municipality works, spot-check a few random others (forms are mostly identical across municipalities on the same platform)

### Anti-Bot / Stealth Requirements

Playwright must be configured with stealth measures:
- Set realistic `User-Agent` string
- Disable `navigator.webdriver` flag (set to `false`)
- Use proper browser fingerprinting (canvas, WebGL, etc.)
- Consider using stealth plugins for Playwright
- Eran's advice: "Ask Claude to list all bot detection methods and implement the countermeasures"

---

## Data Model (Preliminary)

### Jobs Table
```
id              UUID / serial
job_type        string (e.g., "appeal_metropark", "appeal_lola")
status          enum: waiting, in_progress, success, failed
retry_count     integer (default 0)
max_retries     integer (configurable per type)
data            jsonb (raw input data - flexible schema)
result          jsonb (output/result data)
error           text (last error message)
created_at      timestamp
updated_at      timestamp
scheduled_at    timestamp (for cron-scheduled jobs)
completed_at    timestamp
```

### Issuers Table (already exists in DB)
```
id              serial
name            string (municipality name)
platform        string (metropark, lola, mitar)
authority_id    string (platform-specific ID)
supports_parking    boolean
supports_enforcement boolean
config          jsonb (platform-specific config)
```

---

## Input from Fleet System

Fleet sends the following per appeal request:

| Field | Required | Notes |
|-------|----------|-------|
| municipality/issuer | Yes | Which municipality (maps to platform + authority_id) |
| integration_type | Yes | e.g., "lola", "metropark" |
| report_number | Yes | Traffic/parking ticket number |
| vehicle_number | Yes | License plate |
| id_number | Yes | Person's ID (תעודת זהות) |
| first_name | Yes | |
| last_name | Yes | |
| phone | Yes | |
| email | No | Default to company email |
| appeal_type | No | "parking" or "enforcement" (try both if missing) |
| appeal_reason | No | Default: "מבקש להערר" |
| document | No | File/PDF to upload |
| authority_id | Yes | Platform-specific municipality ID |

---

## Implementation Plan

### Phase 1: Foundation
1. Set up TypeScript project with Prisma + PostgreSQL
2. Build generic job system (create, queue, process, retry)
3. Build API endpoint for submitting jobs
4. Build cron worker

### Phase 2: First Crawler - Metropark
1. Implement Metropark crawler with Playwright + stealth
2. Handle both parking and enforcement appeal types
3. Integrate 2captcha for CAPTCHA solving
4. Handle document uploads (real + blank PDF)
5. Detect success/failure from page response
6. Test with Bat Yam (authority_id from Eran)

### Phase 3: Expand
1. Add Lola integration
2. Add Mitar integration
3. Handle edge cases per municipality

---

## Key Decisions Made in Meeting

1. **No queue service** (like SQS/Redis) - use PostgreSQL + cron polling instead (simpler, data persisted)
2. **Not event-driven** - cron-based polling every 10 minutes is sufficient for the scale
3. **Generic job system first** - don't hardcode for appeals; build a reusable job framework
4. **Start with Metropark** - highest coverage, Eran can provide test data
5. **Ignore "Fleet" (פליט) system details for now** - that's a separate system, focus on the crawler/job service
6. **Existing code is legacy** - clean rewrite preferred over working with existing messy code
7. **Prisma ORM** for database access
8. **Status-based retry** over queue-based retry

---

## Open Items / TODOs

- [ ] Get test report numbers from Ori/Eran for Metropark Bat Yam
- [ ] Get 2captcha credentials/API details from existing codebase
- [ ] Get exact Metropark URLs for parking and enforcement
- [ ] Confirm authority_id for Bat Yam and other test municipalities
- [ ] Review existing crawler code (v1/v2) for 2captcha integration reference
- [ ] Define exact API contract with Fleet team
- [ ] Clarify: does Jerusalem use OTP? (mentioned as harder, skip initially)
