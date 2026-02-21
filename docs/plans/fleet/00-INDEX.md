# Fleet Service - Design Documents

## Document Index

| # | Document | Scope |
|---|----------|-------|
| 01 | [Architecture & File Structure](./01-architecture.md) | SOLID principles, layers, directory layout, dependency flow |
| 02 | [Data Model](./02-data-model.md) | PostgreSQL schema, Prisma models, pg-boss integration |
| 03 | [Job System](./03-job-system.md) | pg-boss queues, scheduling, retries, dead-letter, concurrency |
| 04 | [Site Adapters](./04-site-adapters.md) | Plugin pattern, Metropark/Lola/Mitar implementations, adding new sites |
| 05 | [Browser Engine](./05-browser-engine.md) | Playwright stealth, CAPTCHA (2captcha), anti-bot, screenshots |
| 06 | [API Design](./06-api-design.md) | REST endpoints, validation (Zod), middleware chain, auth |
| 07 | [UI Dashboard](./07-ui-dashboard.md) | Next.js pages, tabs, real-time updates, job management |
| 08 | [Logging & Observability](./08-logging.md) | Structured logging (Pino), audit trail, log levels, correlation IDs |
| 09 | [Error Handling](./09-error-handling.md) | Error hierarchy, recovery strategies, failure reporting |
| 10 | [Testing Strategy](./10-testing.md) | TDD workflow, unit/integration/e2e tests, mocks, coverage |
| 11 | [Security](./11-security.md) | Input sanitization, secrets management, rate limiting, CORS |
| 12 | [Implementation Plan](./12-implementation-plan.md) | Phased delivery, milestones, task breakdown |
| 13 | [Review Findings](./13-review-findings.md) | Consolidated findings from 4 review agents, applied changes |
| REF | [Extracted Reference Data](./REF-extracted-data.md) | All keys, selectors, URLs, authority IDs, Hebrew strings from v1+v2 repos |

## Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript (strict) | Type safety, team preference |
| Framework | Next.js 15 (App Router) | Single deployment for API + UI |
| ORM | Prisma | Type-safe queries, migrations |
| Database | PostgreSQL | Single source of truth |
| Job Queue | pg-boss | Queue semantics over PostgreSQL, no Redis needed |
| Browser | Playwright | Better stealth than Puppeteer, native TS |
| CAPTCHA | 2captcha | Existing account, proven integration |
| Validation | Zod | Runtime + compile-time validation |
| Logging | Pino | Structured JSON, fast, correlation IDs |
| Testing | Vitest | Fast, native TS, compatible with Next.js |
| UI Components | shadcn/ui + Tailwind | Modern, accessible, customizable |
