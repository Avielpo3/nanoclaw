# 05 - Browser Engine (Playwright + Stealth + CAPTCHA)

## Browser Pool

Manages Playwright browser instances. Reuses browsers across jobs to avoid startup overhead.

```typescript
// src/infrastructure/browser/browser-pool.ts
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { applyStealthPatches } from './stealth';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: config.browser.headless,
      args: [
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-accelerated-2d-canvas',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }
  return browser;
}

export async function createStealthPage(): Promise<{ context: BrowserContext; page: Page }> {
  const browser = await getBrowser();

  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    viewport: { width: 1920, height: 1080 },
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    geolocation: { latitude: 32.0853, longitude: 34.7818 }, // Tel Aviv
    permissions: ['geolocation'],
  });

  const page = await context.newPage();
  await applyStealthPatches(page);

  return { context, page };
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
```

## Stealth Patches

Anti-bot detection bypass. Addresses all common bot detection vectors.

```typescript
// src/infrastructure/browser/stealth.ts
import { Page } from 'playwright';

export async function applyStealthPatches(page: Page): Promise<void> {
  // 1. Override navigator.webdriver (most common check)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // 2. Override chrome runtime (Puppeteer/Playwright detection)
  await page.addInitScript(() => {
    (window as any).chrome = {
      runtime: {
        onMessage: { addListener: () => {}, removeListener: () => {} },
        sendMessage: () => {},
        connect: () => {},
      },
    };
  });

  // 3. Override navigator.plugins (empty = bot signal)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
      ],
    });
  });

  // 4. Override navigator.languages
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['he-IL', 'he', 'en-US', 'en'],
    });
  });

  // 5. Override permissions API
  await page.addInitScript(() => {
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission } as PermissionStatus);
      }
      return originalQuery(parameters);
    };
  });

  // 6. Mask automation-related properties
  await page.addInitScript(() => {
    // Remove Playwright/automation markers from the prototype chain
    delete (navigator as any).__proto__.webdriver;

    // Override toString to prevent detection via function source
    const origToString = Function.prototype.toString;
    Function.prototype.toString = function () {
      if (this === Function.prototype.toString) return 'function toString() { [native code] }';
      return origToString.call(this);
    };
  });

  // 7. Canvas fingerprint noise (prevents canvas-based bot detection)
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
      const context = originalGetContext.apply(this, [type, ...args] as any);
      if (type === '2d' && context) {
        const originalGetImageData = (context as CanvasRenderingContext2D).getImageData;
        (context as CanvasRenderingContext2D).getImageData = function (...args: any[]) {
          const imageData = originalGetImageData.apply(this, args as any);
          // Add tiny noise to a few pixels
          for (let i = 0; i < 4; i++) {
            const idx = Math.floor(Math.random() * imageData.data.length);
            imageData.data[idx] = imageData.data[idx] ^ 1;
          }
          return imageData;
        };
      }
      return context;
    } as any;
  });

  // 8. WebGL vendor/renderer masking
  await page.addInitScript(() => {
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
      if (parameter === 37445) return 'Intel Inc.';          // UNMASKED_VENDOR_WEBGL
      if (parameter === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
      return getParameter.call(this, parameter);
    };
  });
}

// Rotate user agents to avoid fingerprinting
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}
```

## 2captcha Integration

```typescript
// src/infrastructure/captcha/two-captcha.ts
import { CaptchaSolver } from '@/domain/interfaces/captcha-solver';

export class TwoCaptchaSolver implements CaptchaSolver {
  private apiKey: string;
  private baseUrl = 'http://2captcha.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // Review C2: Track cost per solve
  lastSolveCost: number = 0;

  async solveRecaptchaV2(siteKey: string, pageUrl: string): Promise<string> {
    // Step 1: Submit CAPTCHA task
    const submitUrl = `${this.baseUrl}/in.php?key=${this.apiKey}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${encodeURIComponent(pageUrl)}&json=1`;

    const submitRes = await fetch(submitUrl);
    const submitData = await submitRes.json();

    if (submitData.status !== 1) {
      throw new CaptchaError(`2captcha submit failed: ${submitData.request}`);
    }

    const taskId = submitData.request;

    // Step 2: Poll for result (max 120 seconds)
    const maxWait = 120_000;
    const pollInterval = 5_000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const resultUrl = `${this.baseUrl}/res.php?key=${this.apiKey}&action=get&id=${taskId}&json=1`;
      const resultRes = await fetch(resultUrl);
      const resultData = await resultRes.json();

      if (resultData.status === 1) {
        return resultData.request; // The solved token
      }

      if (resultData.request !== 'CAPCHA_NOT_READY') {
        throw new CaptchaError(`2captcha solve failed: ${resultData.request}`);
      }
    }

    throw new CaptchaError('CAPTCHA solving timed out after 120s');
  }

  async solveImageCaptcha(base64Image: string): Promise<string> {
    const submitUrl = `${this.baseUrl}/in.php`;
    const body = new URLSearchParams({
      key: this.apiKey,
      method: 'base64',
      body: base64Image,
      json: '1',
    });

    const submitRes = await fetch(submitUrl, { method: 'POST', body });
    const submitData = await submitRes.json();

    if (submitData.status !== 1) {
      throw new CaptchaError(`2captcha image submit failed: ${submitData.request}`);
    }

    // Same polling logic as above
    return this.pollForResult(submitData.request);
  }

  private async pollForResult(taskId: string): Promise<string> {
    const maxWait = 60_000;
    const pollInterval = 5_000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      const resultUrl = `${this.baseUrl}/res.php?key=${this.apiKey}&action=get&id=${taskId}&json=1`;
      const resultRes = await fetch(resultUrl);
      const resultData = await resultRes.json();
      if (resultData.status === 1) return resultData.request;
      if (resultData.request !== 'CAPCHA_NOT_READY') {
        throw new CaptchaError(`2captcha failed: ${resultData.request}`);
      }
    }
    throw new CaptchaError('CAPTCHA solving timed out');
  }
}
```

## Page Helpers

```typescript
// src/infrastructure/browser/page-helpers.ts

/** Wait for text to appear anywhere on the page */
export async function waitForText(page: Page, text: string, timeout = 10_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      (t) => document.body?.textContent?.includes(t) ?? false,
      text,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/** Safe navigation with retry */
export async function safeGoto(page: Page, url: string, retries = 2): Promise<void> {
  for (let i = 0; i <= retries; i++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      return;
    } catch (error) {
      if (i === retries) throw error;
      await page.waitForTimeout(2000);
    }
  }
}

/** Extract all text content, cleaned up */
export async function getCleanText(page: Page): Promise<string> {
  const text = await page.textContent('body');
  return (text || '').replace(/\s+/g, ' ').trim();
}
```

## Screenshot Store

```typescript
// src/infrastructure/browser/screenshot-store.ts
import { mkdir } from 'fs/promises';
import { join } from 'path';

export class ScreenshotStore {
  constructor(private baseDir: string) {}

  async getJobDir(jobId: string): Promise<string> {
    const dir = join(this.baseDir, jobId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  /** List all screenshots for a job */
  async listScreenshots(jobId: string): Promise<string[]> {
    const dir = join(this.baseDir, jobId);
    const { readdir } = await import('fs/promises');
    try {
      const files = await readdir(dir);
      return files.filter(f => f.endsWith('.jpg')).map(f => join(dir, f));
    } catch {
      return [];
    }
  }
}
```
