# 12 - Implementation Plan

## Overview

Phased delivery. Each phase is independently deployable and testable. TDD throughout — tests before code.

---

## Phase 1: Foundation (Skeleton + DB + Job System)

**Goal**: Project scaffold, database, generic job system working end-to-end.

### 1.1 Project Setup
- [ ] Initialize Next.js 15 project with TypeScript strict mode
- [ ] Configure Tailwind CSS + shadcn/ui
- [ ] Configure Vitest + testing utilities
- [ ] Set up Prisma with PostgreSQL connection
- [ ] Set up Pino logger with redaction
- [ ] Configure ESLint + Prettier
- [ ] Create `.env.example` with all required variables (including `ENCRYPTION_KEY`)
- [ ] Create directory structure per simplified architecture doc (~60 files)
- [ ] Create `docker-compose.yml` with app + PostgreSQL (review N8: essential for dev onboarding)
- [ ] Create `Dockerfile` for production build

### 1.2 Data Model
- [ ] Write Prisma schema (Site, Issuer, Job, JobEvent) — SystemLog and NotificationConfig deferred per review
- [ ] Add PII encryption helpers (AES-256-GCM) for input/validatedInput fields (review C4)
- [ ] Create initial migration
- [ ] Write seed script with Metropark site + Bat Yam issuer + authority IDs from reference
- [ ] **TDD**: Write tests for seed data integrity
- [ ] **TDD**: Write tests for encryption/decryption round-trip

### 1.3 Domain Layer
- [ ] **TDD**: Write validation schema tests → implement Zod schemas (including deadline, ticketAmount fields)
- [ ] **TDD**: Write error hierarchy tests → implement all error classes in single `errors.ts`
- [ ] Define interfaces in single `interfaces.ts`: SiteAdapter, CaptchaSolver, JobRepository
- [ ] Define types in `types.ts`: enums, value objects
- [ ] Implement operator-friendly error message mapping in `constants.ts` (review I9)

### 1.4 Job System (pg-boss)
- [ ] **TDD**: Write job lifecycle tests (create → queue → process → complete/fail)
- [ ] Set up pg-boss client with configuration
- [ ] Implement worker with queue subscription
- [ ] Implement retry logic (exponential backoff)
- [ ] Implement audit trail (JobEvent creation at each stage)
- [ ] Implement scheduler (cron jobs: retry-stuck, cleanup)

### 1.5 API Layer
- [ ] **TDD**: Write POST /api/jobs tests (valid, invalid, duplicate — note: validation errors return 400, NOT stored as jobs per review I6)
- [ ] **TDD**: Write GET /api/jobs tests (filters, pagination, sorting)
- [ ] **TDD**: Write GET /api/jobs/:id tests
- [ ] **TDD**: Write POST /api/jobs/:id/retry tests
- [ ] **TDD**: Write POST /api/jobs/:id/clone tests (review C1)
- [ ] **TDD**: Write PATCH /api/jobs/:id/resolve tests (review C5)
- [ ] **TDD**: Write POST /api/jobs/bulk tests — partial success response (review I12)
- [ ] Implement all API routes with validation middleware
- [ ] Implement correlation ID middleware
- [ ] Implement API key auth middleware
- [ ] Implement rate limiting
- [ ] Implement error handler middleware
- [ ] Implement GET /api/health endpoint
- [ ] Implement duplicate check with DB constraint on `reportNumber + issuerId` (review C6)

**Deliverable**: API accepts jobs, stores in DB, queues in pg-boss, worker picks up and processes (with a stub adapter that logs and succeeds). Clone, resolve, and bulk endpoints working. Full test suite passing.

---

## Phase 2: Browser Engine + Metropark Adapter

**Goal**: Real Playwright browser with stealth, CAPTCHA solving, Metropark form submission.

### 2.1 Browser Infrastructure
- [ ] Implement browser pool (launch, reuse, cleanup)
- [ ] **TDD**: Write stealth patch tests (webdriver, userAgent, plugins)
- [ ] Implement stealth patches
- [ ] Implement page helpers (safeGoto, waitForText, getCleanText)
- [ ] Implement screenshot store

### 2.2 CAPTCHA Infrastructure
- [ ] **TDD**: Write 2captcha client tests (mock HTTP) — including cost field extraction
- [ ] Implement TwoCaptchaSolver with cost tracking per solve (review C2)
- [ ] Implement MockCaptchaSolver for development mode (review N7)
- [ ] Implement reCAPTCHA v2 extraction (site key from iframe)
- [ ] Implement token injection — solve CAPTCHA late (after form fill, before submit) to avoid expiry (review I11)

### 2.3 Metropark Adapter
- [ ] **TDD**: Write URL builder tests → implement
- [ ] **TDD**: Write field mapping tests → implement
- [ ] **TDD**: Write adapter execute tests (mock page) → implement
  - Test: navigation to correct URL
  - Test: parking vs enforcement type selection
  - Test: auto fallback (parking → enforcement)
  - Test: form field filling
  - Test: CAPTCHA handling
  - Test: document upload (real + blank PDF)
  - Test: success detection
  - Test: not-found detection
  - Test: error handling
- [ ] Implement MetroparkAdapter
- [ ] Implement adapter registry
- [ ] Wire adapter into worker process-job flow

### 2.4 Circuit Breaker (Review I3)
- [ ] **TDD**: Write circuit breaker state machine tests
- [ ] Implement per-site circuit breaker (open after 5 consecutive failures)
- [ ] Implement auto-recovery (half-open after 5 min timeout)
- [ ] Wire into worker: skip jobs for sites with open circuit

### 2.5 Browser Health (Review I10)
- [ ] Add browser health check before each job (`isConnected()`)
- [ ] Force-close and recreate browser on unresponsive state
- [ ] Log browser restart events

### 2.6 Integration Testing
- [ ] Write integration test: API → DB → queue → worker → mock browser
- [ ] Manual test with real Metropark site (Bat Yam, test report from Eran)
- [ ] Verify screenshots captured at each stage
- [ ] Verify audit trail completeness
- [ ] Verify CAPTCHA cost tracked in job result

**Deliverable**: Submit an appeal to Metropark Bat Yam via API call, see it processed end-to-end with screenshots, audit trail, and cost tracking. Circuit breaker pauses queue if site goes down.

---

## Phase 3: UI Dashboard

**Goal**: Full dashboard with all tabs functional.

### 3.1 Layout & Navigation
- [ ] Implement root layout with sidebar
- [ ] Implement header with breadcrumbs
- [ ] Implement bottom status bar
- [ ] Set up routing for all tabs

### 3.2 Dashboard Tab
- [ ] **TDD**: Write StatsCards component test → implement (5 cards including CAPTCHA cost)
- [ ] **TDD**: Write SuccessChart component test → implement
- [ ] Implement SiteBreakdown component
- [ ] Implement IssuerBreakdown component — sortable by success rate (review I4)
- [ ] Implement FailureReasons chart — pie/donut by error code (review I5)
- [ ] Implement CostChart — CAPTCHA spending trend (review C2)
- [ ] Implement RecentActivity feed
- [ ] Wire to GET /api/stats with SWR auto-refresh (weekly trends, not daily — review)

### 3.3 Jobs Tab
- [ ] **TDD**: Write JobTable component test → implement
- [ ] Implement JobFilters (status, site, date range, search)
- [ ] Implement pagination with prev/next keyboard navigation (review N4)
- [ ] Implement bulk actions (retry, cancel)
- [ ] Implement New Job dialog with real-time validation
- [ ] Implement Job Detail page
  - JobTimeline component (vertical timeline with icons)
  - ScreenshotGallery (thumbnail grid + modal viewer)
  - Input/Result data panels
  - DeadlineBadge — red <3 days, yellow <7 days (review C3)
  - **Clone & Edit** button — pre-fills New Job dialog (review C1)
  - **Resolve Manually** button — dialog for reference number + note (review C5)
  - **Suggested Next Steps** — actionable guidance based on error code (review C5/I9)
  - Prev/Next job navigation buttons (review N4)

### 3.4 Sites Tab
- [ ] Implement SiteCard component with health indicator
- [ ] Implement Site Detail page
  - Issuer table
  - Site stats
  - Test form (manual job submission)
  - Configuration panel

### 3.5 Settings Tab
- [ ] Implement settings form with guardrails (review I13):
  - Worker concurrency: range 1-5 with warning text
  - Retry delay: minimum 300 seconds with explanation
  - Max retries: range 1-10
- [ ] Implement worker pause/resume toggle (review I7)
- [ ] Implement CAPTCHA cost display (balance, spent today/week, avg per job)
- [ ] Implement circuit breaker status display per site (review I3)
- [ ] Wire to environment-based notification config

**Deliverable**: Full working dashboard. Create jobs from UI, monitor real-time, clone & edit failed jobs, manually resolve edge cases, track CAPTCHA costs, pause/resume worker. Logs tab deferred to Phase 6.

---

## Phase 4: Notifications + Reporting

**Goal**: Email/webhook notifications on failures, daily reports.

### 4.1 Email Notifications
- [ ] **TDD**: Write email template tests
- [ ] Implement nodemailer transport
- [ ] Implement failure notification email
- [ ] Implement daily summary report email
- [ ] Wire to pg-boss notification queue

### 4.2 Webhook Notifications
- [ ] **TDD**: Write webhook callback tests
- [ ] Implement webhook sender (POST to Fleet system on completion)
- [ ] Include job result, reference number, status

### 4.3 Reporting
- [ ] Implement daily stats aggregation cron job
- [ ] Implement GET /api/stats/daily endpoint
- [ ] Add trend indicators to dashboard (vs yesterday/last week)

**Deliverable**: Get email when a job fails. Fleet system gets webhook callback. Daily summary report.

---

## Phase 5: Lola Adapter + Multi-Site

**Goal**: Add second site adapter, prove the plugin architecture works.

### 5.1 Lola Adapter
- [ ] **TDD**: Write Lola URL builder tests → implement
- [ ] **TDD**: Write Lola field mapping tests → implement
- [ ] **TDD**: Write Lola adapter tests (mock page) → implement
- [ ] Implement LolaAdapter
- [ ] Add Lola site + issuers to seed data
- [ ] Register in adapter registry
- [ ] Manual test with real Lola site

### 5.2 Verify Zero-Change Architecture
- [ ] Confirm: no changes needed to worker, API, UI, or job system
- [ ] Confirm: UI automatically shows Lola in site dropdown
- [ ] Confirm: jobs route to correct adapter based on issuer

**Deliverable**: Both Metropark and Lola working. Adding Lola required zero changes outside `src/adapters/lola/`.

---

## Phase 6: Hardening + Production Readiness

**Goal**: Robust error recovery, monitoring, cleanup, deployment.

### 6.1 Error Recovery
- [ ] Implement stuck-job detection (processing > 10 min → reset to queued)
- [ ] Implement browser crash recovery (detect orphaned contexts)
- [ ] Implement CAPTCHA balance monitoring (alert when low)
- [ ] Implement site health checks (periodic pings)

### 6.2 Performance
- [ ] Add database indexes per query patterns
- [ ] Implement connection pooling (Prisma)
- [ ] Implement log rotation and cleanup crons
- [ ] Screenshot cleanup cron (30-day retention)

### 6.3 System Logs (Deferred from Phase 1 — Review I2)
- [ ] Create SystemLog model and migration
- [ ] Implement Pino DB transport (write INFO+ to SystemLog)
- [ ] Build Logs tab UI with filters (level, context, jobId, search)
- [ ] Implement auto-refresh and color-coded log levels
- [ ] Implement log cleanup cron (90-day retention)

### 6.4 Deployment (docker-compose already created in Phase 1)
- [ ] Document deployment steps
- [ ] Production docker-compose with volume mounts and restart policies

### 6.5 Dynamic Notifications (Deferred from Phase 1 — Review N1)
- [ ] Create NotificationConfig model and migration
- [ ] Build notification management UI in Settings
- [ ] Support multiple notification types (email, webhook, Slack)
- [ ] Per-event subscription configuration

### 6.6 Documentation
- [ ] Write `adding-a-new-site.md` guide
- [ ] Write API documentation (OpenAPI/Swagger)
- [ ] Write operations runbook (troubleshooting, monitoring)

**Deliverable**: Production-ready system with monitoring, documentation, and deployment config.

---

## Future Phases (Post-MVP)

- **Phase 7**: Mitar adapter
- **Phase 8**: Non-parking appeal types (enforcement, environmental)
- **Phase 9**: Proxy rotation for IP-based blocking
- **Phase 10**: Job scheduling (submit now, process at specific time)
- **Phase 11**: Batch import from CSV/Excel
- **Phase 12**: Multi-tenant (multiple Fleet customers)

---

## Reference Data to Import

From the v1/v2 repos, the following data should be seeded into the database:

### Metropark Authority IDs
| City | AuthorityId |
|------|-------------|
| אילת | 4 |
| בת ים | 8 |
| אופקים | 36 |
| נס ציונה | 19 |
| קריית מוצקין | 42 |
| רמלה | 39 |
| נתניה | 40 |
| רחובות | 3 |
| פתח תקווה | 13 |
| כפר סבא | 10 |

### Lola (Mileon) IDs
| City | RashutId |
|------|----------|
| פרדס חנה | 920035 |
| גדרה | 225503 |
| הרצליה | 920039 |
| קרית גת | 920072 |
| גבעתיים | 920044 |
| חדרה | 265000 |
| רמת גן | 186111 |
| לוד | 9 |

Full issuer data available in `/tmp/fleet-reference/v1/model/issuers.json`.
