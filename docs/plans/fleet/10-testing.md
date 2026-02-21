# 10 - Testing Strategy (TDD)

## TDD Workflow

Every feature follows Red-Green-Refactor:

```
1. RED    — Write a failing test that defines expected behavior
2. GREEN  — Write the minimum code to make it pass
3. REFACTOR — Clean up while tests stay green
4. REPEAT
```

**Rule**: No production code without a failing test first.

## Test Runner & Tools

```json
// package.json
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "msw": "^2.0.0"
  }
}
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

## Test Pyramid

```
        /  E2E  \           ~5 tests   (real browser, real site)
       /─────────\
      / Integration\        ~30 tests  (real DB, mocked browser)
     /─────────────\
    /     Unit      \       ~100 tests (pure logic, all mocked)
   /─────────────────\
```

## Test Categories

### 1. Unit Tests (Fast, Isolated)

Test pure business logic with everything mocked.

```typescript
// tests/unit/domain/validation/appeal-validator.test.ts
import { appealInputSchema } from '@/domain/validation/schemas';

describe('appealInputSchema', () => {
  const validInput = {
    reportNumber: '12345678',
    vehicleNumber: '1234567',
    idNumber: '123456789',
    firstName: 'ישראל',
    lastName: 'ישראלי',
    phone: '0501234567',
    issuerCode: '6200',
  };

  it('should accept valid input with all required fields', () => {
    const result = appealInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should reject firstName shorter than 2 characters', () => {
    const result = appealInputSchema.safeParse({ ...validInput, firstName: 'א' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['firstName']);
  });

  it('should reject invalid phone format', () => {
    const result = appealInputSchema.safeParse({ ...validInput, phone: '123' });
    expect(result.success).toBe(false);
  });

  it('should reject missing issuer identifier', () => {
    const { issuerCode, ...noIssuer } = validInput;
    const result = appealInputSchema.safeParse(noIssuer);
    expect(result.success).toBe(false);
  });

  it('should apply default email when not provided', () => {
    const result = appealInputSchema.parse(validInput);
    expect(result.email).toBe('muni@rodprotect.co.il');
  });

  it('should apply default appealType as auto', () => {
    const result = appealInputSchema.parse(validInput);
    expect(result.appealType).toBe('auto');
  });

  it('should accept valid Israeli ID with 9 digits', () => {
    const result = appealInputSchema.safeParse({ ...validInput, idNumber: '012345678' });
    expect(result.success).toBe(true);
  });

  it('should reject Israeli ID with letters', () => {
    const result = appealInputSchema.safeParse({ ...validInput, idNumber: 'ABC123' });
    expect(result.success).toBe(false);
  });
});
```

```typescript
// tests/unit/adapters/metropark/urls.test.ts
import { buildAppealUrl, buildSearchUrl } from '@/adapters/metropark/urls';

describe('Metropark URL builders', () => {
  it('should build parking appeal URL with authority ID', () => {
    const url = buildAppealUrl('parking', '8');
    expect(url).toBe('https://www.metropark.co.il/select-department/select-parking-action/?AuthorityId=8');
  });

  it('should build enforcement appeal URL', () => {
    const url = buildAppealUrl('enforcement', '8');
    expect(url).toContain('select-supervision-action');
    expect(url).toContain('AuthorityId=8');
  });

  it('should build search URL with license number for parking', () => {
    const url = buildSearchUrl('parking', '8', '12345', '7654321');
    expect(url).toContain('LicenseNumber=7654321');
    expect(url).toContain('ReportId=12345');
  });

  it('should build search URL with BRN for enforcement', () => {
    const url = buildSearchUrl('enforcement', '8', '12345', '987654321');
    expect(url).toContain('ReportOwnerIdOrCompanyId=987654321');
  });
});
```

```typescript
// tests/unit/domain/errors/error-hierarchy.test.ts
import { CrawlerError, ValidationError, CaptchaError } from '@/domain/errors';

describe('Error hierarchy', () => {
  it('CrawlerError should be retryable', () => {
    const error = new CrawlerError('Timeout');
    expect(error.retryable).toBe(true);
    expect(error.httpStatus).toBe(502);
  });

  it('ValidationError should not be retryable', () => {
    const error = new ValidationError('Bad input', [{ field: 'name', message: 'required' }]);
    expect(error.retryable).toBe(false);
    expect(error.httpStatus).toBe(400);
  });

  it('toJSON should serialize error correctly', () => {
    const error = new CaptchaError('Solve timeout');
    const json = error.toJSON();
    expect(json).toEqual({
      error: 'CAPTCHA_ERROR',
      message: 'Solve timeout',
      retryable: true,
    });
  });
});
```

### 2. Integration Tests (With Real DB)

Test the full flow with real PostgreSQL, mocked browser.

```typescript
// tests/integration/api/jobs-api.test.ts
import { prisma } from '@/infrastructure/database/prisma-client';

// Use a test database (set in .env.test)
beforeEach(async () => {
  await prisma.jobEvent.deleteMany();
  await prisma.job.deleteMany();
});

describe('POST /api/jobs', () => {
  it('should create a job and enqueue it', async () => {
    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
      body: JSON.stringify({
        reportNumber: '12345678',
        vehicleNumber: '1234567',
        idNumber: '123456789',
        firstName: 'ישראל',
        lastName: 'ישראלי',
        phone: '0501234567',
        issuerCode: '6200',
      }),
    });

    expect(response.status).toBe(201);
    const job = await response.json();
    expect(job.status).toBe('QUEUED');
    expect(job.site).toBe('metropark');

    // Verify in DB
    const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(dbJob).not.toBeNull();
    expect(dbJob!.status).toBe('QUEUED');

    // Verify audit event
    const events = await prisma.jobEvent.findMany({ where: { jobId: job.id } });
    expect(events).toHaveLength(2); // CREATED + QUEUED
  });

  it('should reject duplicate externalId', async () => {
    // Create first job
    await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
      body: JSON.stringify({ ...validInput, externalId: 'dup-1' }),
    });

    // Try duplicate
    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
      body: JSON.stringify({ ...validInput, externalId: 'dup-1' }),
    });

    expect(response.status).toBe(409);
  });

  it('should return 400 for invalid input', async () => {
    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
      body: JSON.stringify({ reportNumber: '' }), // Missing fields
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details.length).toBeGreaterThan(0);
  });
});

describe('GET /api/jobs', () => {
  it('should filter by status', async () => {
    // Create jobs with different statuses...
    const response = await fetch('/api/jobs?status=FAILED', {
      headers: { 'x-api-key': TEST_API_KEY },
    });
    const body = await response.json();
    expect(body.data.every((j: any) => j.status === 'FAILED')).toBe(true);
  });
});
```

### 3. Adapter Tests (Mocked Browser)

Test adapters with a mock Playwright page:

```typescript
// tests/unit/adapters/metropark/metropark-adapter.test.ts
import { MetroparkAdapter } from '@/adapters/metropark/metropark-adapter';
import { createMockPage, createMockContext } from 'tests/mocks/browser';

describe('MetroparkAdapter', () => {
  let adapter: MetroparkAdapter;
  let mockPage: MockPage;
  let ctx: AdapterContext;

  beforeEach(() => {
    adapter = new MetroparkAdapter();
    mockPage = createMockPage();
    ctx = createMockContext(mockPage);
  });

  it('should navigate to correct parking URL', async () => {
    mockPage.textContent.mockResolvedValue('הבקשה הוגשה בהצלחה מספר פנייה 12345');

    await adapter.execute(createTestJob({ type: 'APPEAL_PARKING', authorityId: '8' }), ctx);

    expect(mockPage.goto).toHaveBeenCalledWith(
      expect.stringContaining('select-parking-action/?AuthorityId=8'),
      expect.anything()
    );
  });

  it('should fallback to enforcement when parking not found', async () => {
    // First call (parking) returns not found
    mockPage.textContent
      .mockResolvedValueOnce('דוח/תיק לא נמצא')
      .mockResolvedValueOnce('הבקשה הוגשה בהצלחה');

    const result = await adapter.execute(
      createTestJob({ type: 'APPEAL_AUTO', authorityId: '8' }),
      ctx
    );

    expect(result.success).toBe(true);
    expect(mockPage.goto).toHaveBeenCalledTimes(2); // parking + enforcement
  });

  it('should throw ReportNotFoundError when both types fail', async () => {
    mockPage.textContent.mockResolvedValue('דוח/תיק לא נמצא');

    await expect(
      adapter.execute(createTestJob({ type: 'APPEAL_AUTO' }), ctx)
    ).rejects.toThrow(CrawlerError);
  });

  it('should fill all required form fields', async () => {
    mockPage.textContent.mockResolvedValue('הבקשה הוגשה בהצלחה');

    await adapter.execute(createTestJob(), ctx);

    expect(mockPage.fill).toHaveBeenCalledWith('#txtReportId', '12345678');
    expect(mockPage.fill).toHaveBeenCalledWith('#txtFirstName', 'ישראל');
    expect(mockPage.fill).toHaveBeenCalledWith('#txtLastName', 'ישראלי');
  });

  it('should solve and inject CAPTCHA', async () => {
    mockPage.textContent.mockResolvedValue('הבקשה הוגשה בהצלחה');
    mockPage.$
      .mockResolvedValueOnce({ getAttribute: () => 'https://recaptcha?k=TEST_KEY' }) // iframe
      .mockResolvedValueOnce(null); // no second captcha

    await adapter.execute(createTestJob(), ctx);

    expect(ctx.captchaSolver.solveRecaptchaV2).toHaveBeenCalledWith('TEST_KEY', expect.any(String));
    expect(mockPage.evaluate).toHaveBeenCalled(); // inject token
  });
});
```

### 4. Mock Helpers

```typescript
// tests/mocks/browser.ts
export function createMockPage(): MockPage {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForNavigation: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    textContent: vi.fn().mockResolvedValue(''),
    $: vi.fn().mockResolvedValue(null),
    evaluate: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
    url: vi.fn().mockReturnValue('https://www.metropark.co.il/test'),
  };
}

export function createMockContext(page: MockPage): AdapterContext {
  return {
    page: page as any,
    logger: createMockLogger(),
    screenshotDir: '/tmp/test-screenshots',
    captchaSolver: {
      solveRecaptchaV2: vi.fn().mockResolvedValue('MOCK_TOKEN'),
      solveImageCaptcha: vi.fn().mockResolvedValue('MOCK_TEXT'),
    },
  };
}

// tests/fixtures/jobs.ts
export function createTestJob(overrides?: Partial<Job>): Job {
  return {
    id: 'test-job-1',
    type: 'APPEAL_PARKING',
    status: 'PROCESSING',
    siteId: 'site-1',
    issuerId: 'issuer-1',
    input: {
      reportNumber: '12345678',
      vehicleNumber: '1234567',
      idNumber: '123456789',
      firstName: 'ישראל',
      lastName: 'ישראלי',
      phone: '0501234567',
      email: 'test@test.com',
      appealReason: 'מבקש להערר',
    },
    validatedInput: { /* same as input */ },
    attempts: 0,
    maxAttempts: 3,
    issuer: {
      id: 'issuer-1',
      name: 'בת ים',
      authorityId: '8',
      site: { slug: 'metropark' },
    },
    ...overrides,
  } as any;
}
```

## NPM Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "vitest run tests/e2e",
    "test:coverage": "vitest run --coverage",
    "test:ci": "vitest run --coverage --reporter=junit"
  }
}
```

## TDD Order for Implementation

When building each feature, follow this sequence:

1. **Write schema test** → implement Zod schema
2. **Write URL builder test** → implement URL functions
3. **Write adapter test** (mock browser) → implement adapter
4. **Write API route test** (mock DB) → implement route handler
5. **Write integration test** (real DB) → verify full flow
6. **Write UI component test** (React Testing Library) → build UI
