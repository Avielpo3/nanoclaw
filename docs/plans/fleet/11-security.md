# 11 - Security

## Input Sanitization

All user input passes through Zod validation before any processing. No raw input reaches the database or browser.

```typescript
// Defense layers:
// 1. Zod schema — type checking, format validation, length limits
// 2. Site-specific validation — adapter.validateInput()
// 3. SQL injection — Prisma parameterized queries (automatic)
// 4. XSS — React auto-escapes output, no raw HTML rendering used
```

### Specific Protections

| Threat | Mitigation |
|--------|-----------|
| SQL injection | Prisma ORM uses parameterized queries exclusively |
| XSS | React auto-escapes all rendered content. No raw HTML rendering. |
| Input overflow | Zod enforces max length on all string fields |
| Invalid file upload | Accept only PDF/JPG, validate file headers, max 5MB |
| CAPTCHA key exposure | API key stored in env var, redacted from all logs |
| Credential exposure | `.env` in `.gitignore`, Pino redact config masks sensitive fields |
| API abuse | Rate limiting on all endpoints |
| Unauthorized access | API key required for all `/api/*` routes |

## PII Encryption at Rest (Review C4)

The `input` and `validatedInput` JSON fields contain Israeli IDs, phone numbers, and names. These must be encrypted before writing to the database.

```typescript
// src/infrastructure/db.ts (encryption helpers)
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(env('ENCRYPTION_KEY'), 'hex'); // 32 bytes

export function encrypt(data: Record<string, unknown>): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(encrypted: string): Record<string, unknown> {
  const [ivHex, tagHex, dataHex] = encrypted.split(':');
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}
```

Applied at the repository layer — all reads decrypt, all writes encrypt. The `input` and `validatedInput` fields are stored as encrypted strings in the DB.

## Secrets Management

```bash
# .env.local (gitignored)
DATABASE_URL=postgresql://user:pass@localhost:5432/fleet
TWOCAPTCHA_API_KEY=your_2captcha_key_here
API_KEY=your-secret-api-key
ENCRYPTION_KEY=<64-char-hex-string>          # AES-256 key for PII encryption (review C4)
SMTP_URL=smtp://user:pass@mail.example.com
FLEET_WEBHOOK_URL=https://fleet.example.com/webhook
```

Pino redaction ensures no secrets appear in logs:

```typescript
redact: [
  'input.idNumber',     // PII
  'input.phone',        // PII
  'captchaToken',       // CAPTCHA solution
  '*.apiKey',           // Any API key
  '*.password',         // Any password
  'headers.x-api-key',  // Auth header
]
```

## Rate Limiting

```typescript
// src/middleware.ts
// Simple in-memory rate limiter (no Redis needed)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const apiKey = request.headers.get('x-api-key');

    // Auth check
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 100 requests per minute per API key
    if (!checkRateLimit(apiKey, 100, 60_000)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }
  }
}
```

## CORS

```typescript
// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.ALLOWED_ORIGIN || '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,DELETE' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,x-api-key,x-correlation-id' },
        ],
      },
    ];
  },
};
```

## Browser Security

- Playwright runs in sandboxed mode
- Each job gets a fresh browser context (no cookie leakage between jobs)
- Context is always closed in `finally` block (no orphaned browsers)
- Screenshots stored locally (not exposed via API without auth)
- Browser process has no access to host filesystem beyond screenshot directory

## Data Retention

| Data | Retention | Action |
|------|-----------|--------|
| Successful jobs | 1 year | Archive to cold storage |
| Failed jobs | 90 days | Delete |
| Screenshots | 30 days | Delete via cleanup cron |
| System logs | 90 days | Delete via cleanup cron |
| Job events | Permanent | Part of audit trail |
| pg-boss archive | 30 days | Auto-cleaned by pg-boss |
