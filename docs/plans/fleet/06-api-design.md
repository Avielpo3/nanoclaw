# 06 - API Design

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/jobs` | Submit a new appeal job |
| `GET` | `/api/jobs` | List jobs with filters/pagination |
| `GET` | `/api/jobs/:id` | Get job details with events timeline |
| `PATCH` | `/api/jobs/:id` | Update job (cancel, change priority) |
| `POST` | `/api/jobs/:id/retry` | Retry a failed job |
| `POST` | `/api/jobs/:id/clone` | Clone failed job for edit & resubmit |
| `PATCH` | `/api/jobs/:id/resolve` | Manually resolve a failed job |
| `POST` | `/api/jobs/bulk` | Submit multiple jobs (partial success) |
| `GET` | `/api/sites` | List registered sites |
| `GET` | `/api/sites/:slug` | Site detail with stats |
| `GET` | `/api/stats` | Dashboard aggregate statistics |
| `GET` | `/api/stats/daily` | Daily success/failure breakdown |
| `GET` | `/api/health` | Health check endpoint |
| `POST` | `/api/webhook` | Incoming from Fleet system |

## Request/Response Schemas

### POST /api/jobs — Submit Appeal

```typescript
// Request
{
  "reportNumber": "12345678",
  "vehicleNumber": "12345678",
  "idNumber": "123456789",
  "firstName": "ישראל",
  "lastName": "ישראלי",
  "phone": "0501234567",
  "issuerCode": "6200",           // OR issuerId OR authorityId
  "appealType": "auto",           // "parking" | "enforcement" | "auto"
  "appealReason": "מבקש להערר",   // Optional, has default
  "email": "test@example.com",    // Optional, has default
  "externalId": "fleet-123"       // Optional, for dedup
}

// Response 201
{
  "id": "clxyz...",
  "status": "QUEUED",
  "site": "metropark",
  "issuer": "בת ים",
  "createdAt": "2026-02-21T10:00:00Z",
  "estimatedProcessing": "10 minutes"
}

// Response 400 (validation error)
{
  "error": "VALIDATION_ERROR",
  "message": "Input validation failed",
  "details": [
    { "field": "firstName", "message": "Name must be at least 2 characters" },
    { "field": "phone", "message": "Invalid Israeli phone number" }
  ]
}

// Response 409 (duplicate)
{
  "error": "DUPLICATE",
  "message": "Job with externalId 'fleet-123' already exists",
  "existingJobId": "clxyz..."
}
```

### GET /api/jobs — List Jobs

```typescript
// Query params
?status=FAILED&status=PROCESSING    // Filter by status (multiple)
&site=metropark                      // Filter by site
&issuer=בת+ים                        // Filter by issuer name
&from=2026-02-01&to=2026-02-28      // Date range
&search=12345                        // Search in reportNumber, externalId
&page=1&limit=50                     // Pagination
&sort=createdAt&order=desc           // Sorting

// Response 200
{
  "data": [
    {
      "id": "clxyz...",
      "externalId": "fleet-123",
      "type": "APPEAL_PARKING",
      "status": "SUCCESS",
      "site": { "slug": "metropark", "name": "Metropark" },
      "issuer": { "name": "בת ים", "code": "6200" },
      "input": { "reportNumber": "12345678", "firstName": "ישראל", ... },
      "result": { "referenceNumber": "98765", ... },
      "attempts": 1,
      "processingTime": 45000,
      "createdAt": "2026-02-21T10:00:00Z",
      "completedAt": "2026-02-21T10:00:45Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 234,
    "pages": 5
  }
}
```

### POST /api/jobs/:id/clone — Clone & Edit (Review C1)

```typescript
// Request (optional overrides)
{
  "overrides": {
    "reportNumber": "87654321",     // Fix the wrong field
    "appealType": "enforcement"     // Try different type
  }
}

// Response 201
{
  "id": "clnew...",
  "status": "QUEUED",
  "parentJobId": "cloriginal...",   // Links back to source job
  "site": "metropark",
  "issuer": "בת ים"
}
```

### PATCH /api/jobs/:id/resolve — Manual Resolution (Review C5)

```typescript
// Request
{
  "referenceNumber": "98765",       // Optional: if operator found the real ref number
  "note": "Confirmed via phone call to municipality"
}

// Response 200
{
  "id": "clxyz...",
  "status": "MANUALLY_RESOLVED",
  "resolvedBy": "operator",
  "resolvedAt": "2026-02-21T12:00:00Z"
}
```

### POST /api/jobs/bulk — Bulk Submit (Review I12)

```typescript
// Request
{
  "jobs": [
    { "reportNumber": "111", "vehicleNumber": "222", ... },
    { "reportNumber": "333", "vehicleNumber": "", ... },  // Invalid
    { "reportNumber": "555", "vehicleNumber": "666", ... }
  ]
}

// Response 207 (Multi-Status — never all-or-nothing)
{
  "batchId": "batch-abc123",
  "queued": [
    { "index": 0, "jobId": "cl1..." },
    { "index": 2, "jobId": "cl3..." }
  ],
  "errors": [
    { "index": 1, "errors": [{ "field": "vehicleNumber", "message": "required" }] }
  ],
  "summary": { "total": 3, "queued": 2, "failed": 1 }
}
```

### GET /api/stats — Dashboard Statistics (Enhanced per Review)

```typescript
// Response 200
{
  "total": 1234,
  "today": 45,
  "byStatus": {
    "SUCCESS": 980,
    "FAILED": 54,
    "PROCESSING": 3,
    "QUEUED": 12,
    "PENDING": 5,
    "CANCELLED": 20,
    "MANUALLY_RESOLVED": 8
  },
  "successRate": 0.948,
  "avgProcessingTime": 38000,

  // Per-site breakdown
  "bySite": {
    "metropark": { "total": 1100, "success": 900, "failed": 40 },
    "lola": { "total": 134, "success": 80, "failed": 14 }
  },

  // Per-issuer breakdown (review I4)
  "byIssuer": [
    { "name": "בת ים", "site": "metropark", "total": 300, "success": 285, "successRate": 0.95 },
    { "name": "הרצליה", "site": "lola", "total": 50, "success": 38, "successRate": 0.76 }
  ],

  // Failure reasons (review I5)
  "byErrorCode": {
    "CAPTCHA_ERROR": 20,
    "SITE_UNAVAILABLE": 15,
    "REPORT_NOT_FOUND": 10,
    "CRAWLER_ERROR": 5,
    "BOT_DETECTED": 4
  },

  // CAPTCHA cost tracking (review C2)
  "captcha": {
    "totalCost": 45.20,
    "costToday": 3.50,
    "avgCostPerJob": 0.037,
    "solveRate": 0.96
  },

  // Retry efficiency (review I8)
  "retryEfficiency": {
    "firstAttemptSuccessRate": 0.88,
    "overallSuccessRate": 0.948,
    "retriesThatSucceeded": 72,
    "retriesThatFailed": 18
  },

  "last24h": {
    "submitted": 45,
    "completed": 42,
    "failed": 3
  }
}
```

## Middleware Chain

```typescript
// Every API request passes through this chain:

Request
  │
  ├─ 1. Correlation ID middleware  (assigns unique ID to request)
  ├─ 2. Request logging            (log method, path, body summary)
  ├─ 3. Rate limiter               (prevent API abuse)
  ├─ 4. Auth middleware             (API key or JWT validation)
  ├─ 5. Input validation           (Zod schema parsing)
  ├─ 6. Route handler              (business logic)
  ├─ 7. Response logging           (log status, duration)
  └─ 8. Error handler              (catch-all, format error response)
```

### Correlation ID

Every request gets a unique ID that propagates through logs, job events, and error reports:

```typescript
// src/infrastructure/logging/correlation.ts
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export function withCorrelation(handler: Function) {
  return async (req: NextRequest, ...args: any[]) => {
    const correlationId = req.headers.get('x-correlation-id') || randomUUID();
    const response = await handler(req, ...args, correlationId);
    response.headers.set('x-correlation-id', correlationId);
    return response;
  };
}
```

### API Key Auth

Simple API key authentication for the Fleet system webhook:

```typescript
// src/middleware.ts (Next.js middleware)
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || apiKey !== config.auth.apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
}
```

## Validation Layer

```typescript
// src/app/api/jobs/route.ts
import { appealInputSchema } from '@/domain/validation/schemas';
import { submitAppeal } from '@/application/submit-appeal';

export async function POST(req: NextRequest) {
  const body = await req.json();

  // 1. Validate input
  const parsed = appealInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: 'VALIDATION_ERROR',
      message: 'Input validation failed',
      details: parsed.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    }, { status: 400 });
  }

  // 2. Check for duplicates
  if (parsed.data.externalId) {
    const existing = await prisma.job.findUnique({
      where: { externalId: parsed.data.externalId },
    });
    if (existing) {
      return NextResponse.json({
        error: 'DUPLICATE',
        message: `Job with externalId '${parsed.data.externalId}' already exists`,
        existingJobId: existing.id,
      }, { status: 409 });
    }
  }

  // 3. Submit
  const job = await submitAppeal(parsed.data);

  return NextResponse.json(job, { status: 201 });
}
```
