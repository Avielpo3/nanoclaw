# 02 - Data Model

## Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Issuers & Sites ───────────────────────────────────

model Site {
  id          String   @id @default(cuid())
  slug        String   @unique              // "metropark", "lola", "mitar"
  name        String                        // "Metropark", "Lola"
  baseUrl     String                        // "https://www.metropark.co.il"
  enabled     Boolean  @default(true)
  config      Json     @default("{}")       // Site-specific config (timeouts, etc.)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  issuers     Issuer[]
  jobs        Job[]
}

model Issuer {
  id              String   @id @default(cuid())
  name            String                    // "בת ים", "ראשון לציון"
  nameEn          String?                   // "Bat Yam"
  code            String                    // Municipal code "6200"
  authorityId     String                    // Platform-specific ID "8"
  siteId          String
  site            Site     @relation(fields: [siteId], references: [id])
  supportedTypes  String[] @default(["parking"]) // ["parking", "enforcement"]
  enabled         Boolean  @default(true)
  config          Json     @default("{}")   // Issuer-specific overrides
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  jobs            Job[]

  @@unique([siteId, authorityId])
  @@index([code])
}

// ─── Jobs ───────────────────────────────────────────────

// Review change: Removed VALIDATION_ERROR (don't store failed validations as jobs).
// Added MANUALLY_RESOLVED for human-in-the-loop resolution of edge cases.
enum JobStatus {
  PENDING            // Validated, waiting in queue
  QUEUED             // Sent to pg-boss queue
  PROCESSING         // Worker picked it up
  SUCCESS            // Appeal submitted successfully
  FAILED             // All retries exhausted
  CANCELLED          // Manually cancelled
  MANUALLY_RESOLVED  // Operator resolved manually (ref number entered by hand)
}

enum JobType {
  APPEAL_PARKING      // Parking ticket appeal
  APPEAL_ENFORCEMENT  // Enforcement/supervision appeal
  APPEAL_AUTO         // Try parking, fallback to enforcement
}

model Job {
  id              String    @id @default(cuid())
  externalId      String?   @unique          // ID from Fleet system (dedup)
  type            JobType
  status          JobStatus @default(PENDING)
  priority        Int       @default(0)      // Higher = processed first

  // Relations
  siteId          String
  site            Site      @relation(fields: [siteId], references: [id])
  issuerId        String
  issuer          Issuer    @relation(fields: [issuerId], references: [id])

  // Input data
  input           Json                       // Full input payload (flexible)
  validatedInput  Json?                      // After validation/normalization

  // Result data
  result          Json?                      // Success result (reference number, etc.)
  error           Json?                      // Error details (code, message, screenshot path)
  screenshotPath  String?                    // Path to final screenshot

  // Traceability (review C1: clone & edit)
  parentJobId     String?                    // If cloned from a failed job
  batchId         String?                    // Groups bulk-submitted jobs (review I12)

  // Deadline awareness (review C3)
  ticketDate      DateTime?                  // Date ticket was issued
  deadline        DateTime?                  // Legal appeal deadline

  // Processing metadata
  attempts        Int       @default(0)
  maxAttempts     Int       @default(3)
  lastAttemptAt   DateTime?
  nextAttemptAt   DateTime?
  processingTime  Int?                       // Duration in ms
  captchaCost     Float?                     // Cost in USD from 2captcha (review C2)

  // Manual resolution (review C5)
  resolvedBy      String?                    // Operator who manually resolved
  resolvedAt      DateTime?
  resolutionNote  String?                    // Why it was manually resolved

  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  completedAt     DateTime?

  // Audit trail
  events          JobEvent[]

  @@index([status])
  @@index([siteId, status])
  @@index([createdAt])
  @@index([issuerId])
  @@index([batchId])
  @@index([deadline])
}

// ─── Job Events (Audit Trail) ───────────────────────────

enum JobEventType {
  CREATED
  VALIDATED
  VALIDATION_FAILED
  QUEUED
  PROCESSING_STARTED
  PAGE_LOADED
  FORM_FILLED
  CAPTCHA_REQUESTED
  CAPTCHA_SOLVED
  CAPTCHA_FAILED
  FORM_SUBMITTED
  SUCCESS_DETECTED
  FAILURE_DETECTED
  RETRY_SCHEDULED
  MAX_RETRIES_REACHED
  CANCELLED
  SCREENSHOT_TAKEN
  ERROR
}

model JobEvent {
  id        String       @id @default(cuid())
  jobId     String
  job       Job          @relation(fields: [jobId], references: [id], onDelete: Cascade)
  type      JobEventType
  message   String
  data      Json?                            // Extra context per event type
  createdAt DateTime     @default(now())

  @@index([jobId, createdAt])
  @@index([type])
}

// ─── System Logs ─────────────────────────────────────────
// DEFERRED to Phase 6 (review I2). For Phase 1-5, use Pino stdout + JobEvent
// audit trail. The JobEvent timeline on job detail page covers debugging needs.
// When ready, uncomment and add migration:
//
// model SystemLog {
//   id            String   @id @default(cuid())
//   level         String
//   message       String
//   context       String?
//   correlationId String?
//   jobId         String?
//   data          Json?
//   createdAt     DateTime @default(now())
//   @@index([correlationId])
//   @@index([jobId])
//   @@index([createdAt])
// }

// ─── Notification Settings ──────────────────────────────
// SIMPLIFIED for Phase 1 (review N1). Use environment variables:
//   EMAIL_ON_FAILURE=true, EMAIL_TO=admin@company.com
//   WEBHOOK_ON_COMPLETION=true, FLEET_WEBHOOK_URL=https://...
// Build dynamic NotificationConfig model in Phase 4 when needed.
```

---

## Appeal Input Schema (Zod)

This is what the API receives and validates before creating a Job:

```typescript
// src/domain/validation/schemas.ts
import { z } from 'zod';

const hebrewOrEnglishName = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(50)
  .trim();

const israeliId = z
  .string()
  .regex(/^\d{5,9}$/, 'Israeli ID must be 5-9 digits');

const vehicleNumber = z
  .string()
  .regex(/^\d{5,8}$/, 'Vehicle number must be 5-8 digits');

const reportNumber = z
  .string()
  .min(1, 'Report number is required')
  .max(20);

export const appealInputSchema = z.object({
  // Required fields
  reportNumber: reportNumber,
  vehicleNumber: vehicleNumber,
  idNumber: israeliId,
  firstName: hebrewOrEnglishName,
  lastName: hebrewOrEnglishName,
  phone: z.string().regex(/^0\d{8,9}$/, 'Invalid Israeli phone number'),

  // Issuer identification (one of these)
  issuerId: z.string().optional(),
  issuerCode: z.string().optional(),
  authorityId: z.string().optional(),

  // Optional fields with defaults
  email: z.string().email().default('muni@rodprotect.co.il'),
  appealType: z.enum(['parking', 'enforcement', 'auto']).default('auto'),
  appealReason: z.string().default('מבקש להערר'),

  // Address (optional)
  city: z.string().optional(),
  street: z.string().optional(),
  houseNumber: z.string().default('1'),
  apartment: z.string().default('1'),

  // Documents
  documentUrl: z.string().url().optional(), // URL to download document

  // External reference
  externalId: z.string().optional(), // Fleet system ID for dedup

  // Deadline tracking (review C3)
  ticketDate: z.string().datetime().optional(),  // When ticket was issued
  deadline: z.string().datetime().optional(),     // Legal appeal deadline

  // Cost tracking (review N3)
  ticketAmount: z.number().positive().optional(), // Ticket value in NIS (for ROI)
}).refine(
  (data) => data.issuerId || data.issuerCode || data.authorityId,
  { message: 'Must provide issuerId, issuerCode, or authorityId' }
);

export type AppealInput = z.infer<typeof appealInputSchema>;
```

---

## pg-boss Integration

pg-boss stores its own tables in a `pgboss` schema within the same PostgreSQL database. No additional setup needed - it auto-creates on first connection.

```
PostgreSQL Database: fleet_db
├── public schema (Prisma)
│   ├── Site
│   ├── Issuer
│   ├── Job
│   ├── JobEvent
│   ├── SystemLog
│   └── NotificationConfig
└── pgboss schema (auto-managed)
    ├── job
    ├── schedule
    ├── subscription
    └── archive
```

The `Job` table in Prisma is the **source of truth** for job data and history. pg-boss handles only the queue mechanics (scheduling, delivery, retries). When a job is picked up by pg-boss, the worker updates the corresponding Prisma `Job` record.
