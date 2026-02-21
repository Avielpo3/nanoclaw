# 01 - Architecture & File Structure

## Principles

### SOLID Applied

| Principle | Application |
|-----------|-------------|
| **Single Responsibility** | Each module owns exactly one concern. A site adapter only knows how to fill forms. The job system only knows how to schedule work. The API only knows how to validate and enqueue. |
| **Open/Closed** | Adding a new site = adding a new adapter file implementing `SiteAdapter` interface. Zero changes to existing code. |
| **Liskov Substitution** | All site adapters are interchangeable through the `SiteAdapter` interface. The worker doesn't know which site it's talking to. |
| **Interface Segregation** | Small, focused interfaces. `SiteAdapter` doesn't force CAPTCHA methods on sites that don't need them. Browser operations are separate from form-filling. |
| **Dependency Inversion** | High-level modules (job worker) depend on abstractions (`SiteAdapter` interface), not concrete implementations (MetroparkAdapter). |

### Clean Architecture Layers

```
┌─────────────────────────────────────────┐
│          Presentation Layer             │  Next.js pages, API routes
│  (UI components, route handlers)        │
├─────────────────────────────────────────┤
│          Application Layer              │  Use cases, orchestration
│  (job orchestrator, API controllers)    │
├─────────────────────────────────────────┤
│          Domain Layer                   │  Business logic, interfaces
│  (SiteAdapter, validation, entities)    │
├─────────────────────────────────────────┤
│          Infrastructure Layer           │  External systems
│  (Prisma, pg-boss, Playwright, 2captcha)│
└─────────────────────────────────────────┘
```

**Dependency rule**: Dependencies point inward only. Domain never imports from Infrastructure.

---

## Directory Structure

> **Simplified after review** (see [13-review-findings.md](./13-review-findings.md) I1). Flattened from ~110 to ~60 files. Removed event bus, merged entity files, consolidated error classes. Adapter pattern preserved (genuinely valuable).

```
fleet-service/
├── .env.example                    # Environment template
├── .env.local                      # Local overrides (gitignored)
├── docker-compose.yml              # App + PostgreSQL (dev & deploy)
├── Dockerfile                      # Production build
├── next.config.ts                  # Next.js configuration
├── tailwind.config.ts              # Tailwind CSS config
├── tsconfig.json                   # TypeScript config (strict: true)
├── vitest.config.ts                # Test runner config
├── prisma/
│   ├── schema.prisma               # Database schema
│   ├── seed.ts                     # Seed data (issuers, authorities)
│   └── migrations/                 # Auto-generated migrations
│
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # Root layout with sidebar nav
│   │   ├── page.tsx                # Redirect to /dashboard
│   │   ├── dashboard/page.tsx      # Overview: stats, charts, recent jobs
│   │   ├── jobs/
│   │   │   ├── page.tsx            # Job list with filters, search, bulk actions
│   │   │   └── [id]/page.tsx       # Job detail: timeline, screenshots, retry
│   │   ├── sites/
│   │   │   ├── page.tsx            # Site cards with health indicators
│   │   │   └── [slug]/page.tsx     # Site detail: issuers, stats, test form
│   │   ├── settings/page.tsx       # Global settings (with guardrails)
│   │   └── api/
│   │       ├── jobs/
│   │       │   ├── route.ts        # POST (create), GET (list)
│   │       │   ├── bulk/route.ts   # POST (bulk submit with partial success)
│   │       │   └── [id]/
│   │       │       ├── route.ts    # GET (detail), PATCH (cancel/resolve)
│   │       │       ├── retry/route.ts  # POST (retry failed job)
│   │       │       └── clone/route.ts  # POST (clone & edit failed job)
│   │       ├── sites/route.ts      # GET (list sites)
│   │       ├── stats/route.ts      # GET (stats with per-issuer & cost)
│   │       ├── health/route.ts     # GET (health check)
│   │       └── webhook/route.ts    # POST (incoming from Fleet)
│   │
│   ├── domain/                     # Business logic (pure, no external deps)
│   │   ├── interfaces.ts           # SiteAdapter, CaptchaSolver, JobRepository
│   │   ├── schemas.ts              # All Zod validation schemas
│   │   ├── errors.ts               # AppError base + all error classes
│   │   └── types.ts                # Shared types, enums, value objects
│   │
│   ├── application/                # Use cases / orchestration
│   │   ├── submit-appeal.ts        # Validate → enqueue → respond
│   │   ├── process-job.ts          # Dequeue → adapt → execute → report
│   │   ├── retry-job.ts            # Re-enqueue a failed job
│   │   ├── clone-job.ts            # Clone failed job with edited input
│   │   ├── resolve-job.ts          # Manual resolution of failed jobs
│   │   └── get-stats.ts            # Aggregate stats for dashboard
│   │
│   ├── infrastructure/             # External system implementations
│   │   ├── db.ts                   # Prisma client singleton + encryption helpers
│   │   ├── queue/
│   │   │   ├── boss-client.ts      # pg-boss singleton, queue config
│   │   │   ├── worker.ts           # Job worker with circuit breaker
│   │   │   └── scheduler.ts        # Cron schedule definitions
│   │   ├── browser/
│   │   │   ├── browser-pool.ts     # Playwright lifecycle + health check
│   │   │   ├── stealth.ts          # Anti-bot patches
│   │   │   ├── page-helpers.ts     # Common page actions
│   │   │   └── screenshot-store.ts # Save/list screenshots
│   │   ├── captcha/
│   │   │   ├── two-captcha.ts      # 2captcha with cost tracking
│   │   │   └── mock-captcha.ts     # Dev mode mock solver
│   │   ├── notification.ts         # Email + webhook (env-config driven)
│   │   └── logger.ts               # Pino logger + audit trail writer
│   │
│   ├── adapters/                   # Site adapter implementations
│   │   ├── registry.ts             # Maps site slug → adapter class
│   │   ├── base-adapter.ts         # Shared form-filling, CAPTCHA, screenshot logic
│   │   ├── metropark/
│   │   │   ├── adapter.ts          # MetroparkAdapter implementation
│   │   │   ├── selectors.ts        # CSS selectors
│   │   │   ├── urls.ts             # URL builders
│   │   │   └── field-mapping.ts    # Input → form field mapping
│   │   └── lola/
│   │       ├── adapter.ts
│   │       ├── selectors.ts
│   │       ├── urls.ts
│   │       └── field-mapping.ts
│   │
│   ├── components/                 # React UI components
│   │   ├── ui/                     # shadcn/ui base (button, card, table, etc.)
│   │   ├── layout/
│   │   │   ├── sidebar.tsx         # Navigation sidebar
│   │   │   └── page-shell.tsx      # Header + breadcrumbs + wrapper
│   │   ├── jobs/
│   │   │   ├── job-table.tsx       # Sortable, filterable job table
│   │   │   ├── job-timeline.tsx    # Visual timeline of job stages
│   │   │   ├── job-filters.tsx     # Filter bar
│   │   │   └── job-actions.tsx     # Retry, cancel, clone, resolve buttons
│   │   ├── dashboard/
│   │   │   ├── stats-cards.tsx     # KPI cards with trends
│   │   │   ├── success-chart.tsx   # Success/failure over time
│   │   │   ├── cost-chart.tsx      # CAPTCHA cost trends
│   │   │   └── recent-activity.tsx # Live feed
│   │   └── sites/
│   │       ├── site-card.tsx       # Site summary with health
│   │       └── site-test-form.tsx  # Manual test submission
│   │
│   ├── hooks/                      # React hooks
│   │   ├── use-jobs.ts
│   │   └── use-stats.ts
│   │
│   ├── lib/                        # Shared utilities
│   │   ├── config.ts               # Environment config loader
│   │   ├── constants.ts            # Error message mappings, limits
│   │   └── utils.ts                # Helpers, date formatting
│   │
│   └── middleware.ts               # Auth, rate limiting, correlation ID
│
├── tests/
│   ├── setup.ts                    # Global test setup
│   ├── fixtures/                   # Job, appeal, issuer factories
│   ├── mocks/                      # Mock browser, captcha, database
│   ├── unit/                       # Fast isolated tests
│   ├── integration/                # Tests with real DB
│   └── e2e/                        # Real browser tests
│
├── scripts/
│   ├── seed-issuers.ts             # Populate from reference data
│   └── test-captcha.ts             # Standalone CAPTCHA test
│
└── docs/
    └── adding-a-new-site.md        # Guide for new adapter development
```

---

## Module Dependency Graph

```
API Routes ──→ Application (use cases) ──→ Domain (interfaces, entities)
                     │                            ▲
                     ▼                            │
              Infrastructure ─────────────────────┘
              (Prisma, pg-boss, Playwright)

UI Components ──→ Hooks ──→ API Routes (fetch)
```

**Rules:**
- `domain/` imports nothing from other layers
- `application/` imports from `domain/` only
- `infrastructure/` implements `domain/` interfaces
- `adapters/` implements `domain/SiteAdapter` interface
- `app/api/` calls `application/` use cases
- `components/` calls `app/api/` via hooks

> **Note**: Event bus removed per review (I1/N2). Use direct function calls. If decoupled subscribers are needed later, add event bus then.

---

## Configuration

```typescript
// src/lib/config.ts
const config = {
  database: {
    url: env('DATABASE_URL'),
  },
  queue: {
    schema: 'pgboss',
    retryLimit: 3,
    retryDelay: 600,        // 10 minutes between retries
    expireInHours: 24,
    monitorStateIntervalSeconds: 30,
  },
  browser: {
    headless: env('BROWSER_HEADLESS', 'true') === 'true',
    timeout: 120_000,       // 2 minutes per page operation
    screenshotDir: env('SCREENSHOT_DIR', './screenshots'),
  },
  captcha: {
    provider: '2captcha',
    apiKey: env('TWOCAPTCHA_API_KEY'),
    timeout: 120_000,       // 2 minutes to solve
  },
  notification: {
    email: {
      enabled: env('EMAIL_ENABLED', 'false') === 'true',
      from: env('EMAIL_FROM', 'fleet@rodprotect.co.il'),
      smtp: env('SMTP_URL'),
    },
    webhook: {
      url: env('FLEET_WEBHOOK_URL'),
    },
  },
  logging: {
    level: env('LOG_LEVEL', 'info'),
    pretty: env('NODE_ENV') !== 'production',
  },
} as const;
```
