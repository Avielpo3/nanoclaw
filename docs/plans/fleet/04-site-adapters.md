# 04 - Site Adapters (Plugin Architecture)

## SiteAdapter Interface

Every site (Metropark, Lola, Mitar, future sites) implements this interface. The worker calls it without knowing which site it's talking to.

```typescript
// src/domain/interfaces/site-adapter.ts
import { Page } from 'playwright';

export interface AdapterContext {
  page: Page;                    // Playwright page (stealth-configured)
  logger: Logger;                // Child logger with jobId context
  screenshotDir: string;         // Where to save screenshots
  captchaSolver: CaptchaSolver;  // Injected CAPTCHA service
}

export interface AdapterResult {
  success: boolean;
  referenceNumber?: string;      // Confirmation/tracking number
  message: string;               // Human-readable result
  screenshots: string[];         // Paths to captured screenshots
  metadata?: Record<string, unknown>; // Site-specific extra data
}

export interface SiteAdapter {
  /** Unique slug matching Site.slug in DB */
  readonly slug: string;

  /** Human-readable name */
  readonly name: string;

  /** Supported job types */
  readonly supportedTypes: JobType[];

  /**
   * Execute the appeal submission.
   * Must be idempotent-safe: if called twice with same input,
   * second call should detect existing submission or safely re-submit.
   */
  execute(job: Job, ctx: AdapterContext): Promise<AdapterResult>;

  /**
   * Build the target URL for this job.
   * Used for logging and debugging.
   */
  buildUrl(job: Job): string;

  /**
   * Validate site-specific fields beyond generic validation.
   * Called before enqueueing.
   */
  validateInput(input: Record<string, unknown>): ValidationResult;
}
```

## Base Adapter

Common logic shared across all adapters:

```typescript
// src/adapters/base-adapter.ts
export abstract class BaseAdapter implements SiteAdapter {
  abstract readonly slug: string;
  abstract readonly name: string;
  abstract readonly supportedTypes: JobType[];

  abstract execute(job: Job, ctx: AdapterContext): Promise<AdapterResult>;
  abstract buildUrl(job: Job): string;
  abstract validateInput(input: Record<string, unknown>): ValidationResult;

  // ─── Shared helpers ───

  protected async fillField(page: Page, selector: string, value: string, log: Logger) {
    log.debug({ selector, valueLength: value.length }, 'Filling field');
    await page.waitForSelector(selector, { timeout: 10_000 });
    await page.fill(selector, value);
  }

  protected async clickButton(page: Page, selector: string, log: Logger) {
    log.debug({ selector }, 'Clicking button');
    await page.waitForSelector(selector, { timeout: 10_000 });
    await page.click(selector);
  }

  protected async takeScreenshot(
    page: Page, name: string, dir: string, log: Logger
  ): Promise<string> {
    const path = `${dir}/${name}-${Date.now()}.jpg`;
    await page.screenshot({ path, type: 'jpeg', fullPage: true });
    log.info({ path }, 'Screenshot captured');
    return path;
  }

  protected async solveCaptcha(
    page: Page, ctx: AdapterContext, siteKeySelector: string
  ): Promise<string> {
    const log = ctx.logger;
    log.info('Solving CAPTCHA');

    // Extract site key from reCAPTCHA iframe
    const iframe = await page.$(siteKeySelector);
    if (!iframe) throw new CaptchaError('reCAPTCHA iframe not found');

    const src = await iframe.getAttribute('src');
    if (!src) throw new CaptchaError('reCAPTCHA iframe has no src');

    const siteKey = new URL(src).searchParams.get('k');
    if (!siteKey) throw new CaptchaError('Could not extract site key');

    log.info({ siteKey }, 'Extracted site key, requesting solution');

    const token = await ctx.captchaSolver.solveRecaptchaV2(siteKey, page.url());

    log.info('CAPTCHA solved, injecting token');
    return token;
  }

  protected async injectCaptchaToken(page: Page, token: string, elementId = 'g-recaptcha-response') {
    await page.evaluate(({ token, elementId }) => {
      const el = document.getElementById(elementId);
      if (el) {
        // Set the value on the textarea element used by reCAPTCHA
        (el as HTMLTextAreaElement).value = token;
      }
    }, { token, elementId });
  }

  protected async uploadBlankPdf(page: Page, selector: string, log: Logger) {
    log.debug({ selector }, 'Uploading blank PDF');
    const input = await page.$(selector);
    if (!input) throw new CrawlerError(`Upload input not found: ${selector}`);
    // Create a minimal valid PDF in memory
    const blankPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Pages 2 0 R/Type/Catalog>>endobj\n' +
      '2 0 obj<</Count 1/Kids[3 0 R]/Type/Pages>>endobj\n' +
      '3 0 obj<</MediaBox[0 0 612 792]/Parent 2 0 R/Type/Page>>endobj\n' +
      'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n' +
      '0000000058 00000 n \n0000000115 00000 n \n' +
      'trailer<</Root 1 0 R/Size 4>>\nstartxref\n190\n%%EOF'
    );
    const tmpPath = `/tmp/blank-${Date.now()}.pdf`;
    const fs = await import('fs/promises');
    await fs.writeFile(tmpPath, blankPdf);
    await input.setInputFiles(tmpPath);
    await fs.unlink(tmpPath);
  }
}
```

## Metropark Adapter

```typescript
// src/adapters/metropark/metropark-adapter.ts
import { SELECTORS } from './selectors';
import { buildAppealUrl } from './urls';
import { mapFields } from './field-mapping';

export class MetroparkAdapter extends BaseAdapter {
  readonly slug = 'metropark';
  readonly name = 'Metropark';
  readonly supportedTypes = [
    JobType.APPEAL_PARKING,
    JobType.APPEAL_ENFORCEMENT,
    JobType.APPEAL_AUTO,
  ];

  async execute(job: Job, ctx: AdapterContext): Promise<AdapterResult> {
    const { page, logger: log } = ctx;
    const input = job.validatedInput as AppealInput;
    const screenshots: string[] = [];

    // Determine appeal types to try
    const types = this.getTypesToTry(job.type, job.issuer);

    for (const appealType of types) {
      try {
        return await this.tryAppeal(appealType, input, job, ctx, screenshots);
      } catch (error) {
        if (error instanceof ReportNotFoundError && types.length > 1) {
          log.warn({ appealType }, 'Report not found, trying next type');
          continue;
        }
        throw error;
      }
    }

    throw new CrawlerError('Report not found in any appeal type');
  }

  private async tryAppeal(
    appealType: 'parking' | 'enforcement',
    input: AppealInput,
    job: Job,
    ctx: AdapterContext,
    screenshots: string[],
  ): Promise<AdapterResult> {
    const { page, logger: log } = ctx;
    const url = buildAppealUrl(appealType, job.issuer.authorityId);

    // Step 1: Navigate
    log.info({ url, appealType }, 'Navigating to appeal form');
    await page.goto(url, { waitUntil: 'networkidle' });
    screenshots.push(await this.takeScreenshot(page, 'page-loaded', ctx.screenshotDir, log));

    // Step 2: Fill report details
    log.info('Filling report search fields');
    await this.fillField(page, SELECTORS.REPORT_ID, input.reportNumber, log);
    if (appealType === 'parking') {
      await this.fillField(page, SELECTORS.LICENSE_NUMBER, input.vehicleNumber, log);
    } else {
      await this.fillField(page, SELECTORS.OWNER_ID, input.idNumber, log);
    }

    // Step 3: Solve CAPTCHA
    await this.handleCaptcha(page, ctx, SELECTORS.CAPTCHA_IFRAME, 'g-recaptcha-response');

    // Step 4: Submit search
    log.info('Submitting search');
    await this.clickButton(page, SELECTORS.SEARCH_BUTTON, log);
    await page.waitForNavigation({ timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    screenshots.push(await this.takeScreenshot(page, 'after-search', ctx.screenshotDir, log));

    // Step 5: Check if report found
    const pageText = await page.textContent('body') || '';
    if (pageText.includes('דוח/תיק לא נמצא') || pageText.includes('בחר רשות')) {
      throw new ReportNotFoundError(appealType);
    }

    // Step 6: Fill appeal form
    log.info('Filling appeal form fields');
    const fields = mapFields(input);
    for (const [selector, value] of Object.entries(fields)) {
      await this.fillField(page, selector, value, log);
    }

    // Step 7: Upload documents
    log.info('Uploading documents');
    if (input.documentUrl) {
      await this.uploadDocument(page, SELECTORS.DOCUMENT_1, input.documentUrl, log);
    } else {
      await this.uploadBlankPdf(page, SELECTORS.DOCUMENT_1, log);
    }
    await this.uploadBlankPdf(page, SELECTORS.DOCUMENT_2, log);

    // Step 8: Solve second CAPTCHA (if present)
    const hasCaptcha2 = await page.$(SELECTORS.CAPTCHA_IFRAME_2);
    if (hasCaptcha2) {
      await this.handleCaptcha(page, ctx, SELECTORS.CAPTCHA_IFRAME_2, 'g-recaptcha-response-1');
    }

    screenshots.push(await this.takeScreenshot(page, 'before-submit', ctx.screenshotDir, log));

    // Step 9: Submit appeal
    log.info('Submitting appeal');
    await this.clickButton(page, SELECTORS.SUBMIT_BUTTON, log);
    await page.waitForNavigation({ timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    screenshots.push(await this.takeScreenshot(page, 'after-submit', ctx.screenshotDir, log));

    // Step 10: Detect result
    const resultText = await page.textContent('body') || '';
    if (resultText.includes('הבקשה הוגשה בהצלחה') || resultText.includes('בקשה נשלחה')) {
      const refNumber = this.extractReferenceNumber(resultText);
      log.info({ refNumber }, 'Appeal submitted successfully');
      return {
        success: true,
        referenceNumber: refNumber,
        message: `Appeal submitted successfully. Reference: ${refNumber || 'N/A'}`,
        screenshots,
      };
    }

    throw new CrawlerError(`Unexpected result page: ${resultText.substring(0, 200)}`);
  }

  private getTypesToTry(jobType: JobType, issuer: Issuer): ('parking' | 'enforcement')[] {
    switch (jobType) {
      case JobType.APPEAL_PARKING: return ['parking'];
      case JobType.APPEAL_ENFORCEMENT: return ['enforcement'];
      case JobType.APPEAL_AUTO: return ['parking', 'enforcement'];
    }
  }

  private async handleCaptcha(page: Page, ctx: AdapterContext, iframeSelector: string, responseId: string) {
    const token = await this.solveCaptcha(page, ctx, iframeSelector);
    await this.injectCaptchaToken(page, token, responseId);
    await page.waitForTimeout(1000);
  }

  private extractReferenceNumber(text: string): string | undefined {
    const match = text.match(/מספר\s*(?:פנייה|אסמכתא)[:\s]*(\d+)/);
    return match?.[1];
  }

  buildUrl(job: Job): string {
    return buildAppealUrl('parking', job.issuer.authorityId);
  }

  validateInput(input: Record<string, unknown>): ValidationResult {
    if (input.authorityId && !/^\d+$/.test(String(input.authorityId))) {
      return { valid: false, errors: ['Metropark authorityId must be numeric'] };
    }
    return { valid: true, errors: [] };
  }
}
```

## Selectors (Constants)

```typescript
// src/adapters/metropark/selectors.ts
export const SELECTORS = {
  // Search form
  REPORT_ID: '#txtReportId',
  LICENSE_NUMBER: '#txtLicenseNumber',
  OWNER_ID: '#txtReportOwnerIdOrCompanyId',
  SEARCH_BUTTON: 'body > div.wrapper > div > div:nth-child(5) > div.search-form.type-2 > form > center > button',

  // Appeal form
  PERSONAL_ID: '#txtPersonalOrCompanyID',
  FIRST_NAME: '#txtFirstName',
  LAST_NAME: '#txtLastName',
  PHONE: '#txtPhone1',
  EMAIL: '#txtEmail',
  CITY: '#txtCity',
  STREET: '#txtStreet',
  HOUSE_NUMBER: '#txtHouseNumber',
  APARTMENT: '#txtApartmentNumber',

  // Documents
  DOCUMENT_1: '#txtFileDocuments',
  DOCUMENT_2: '#txtFileID',

  // CAPTCHA
  CAPTCHA_IFRAME: '.g-recaptcha iframe',
  CAPTCHA_IFRAME_2: '.g-recaptcha:nth-of-type(2) iframe',
  CAPTCHA_RESPONSE: '#g-recaptcha-response',
  CAPTCHA_RESPONSE_2: '#g-recaptcha-response-1',

  // Submit
  SUBMIT_BUTTON: '#convertionForm > div.info-box > div:nth-child(3) > button',

  // Result detection
  SUCCESS_TEXT: 'הבקשה הוגשה בהצלחה',
  NOT_FOUND_TEXT: 'דוח/תיק לא נמצא',
} as const;
```

## URLs

```typescript
// src/adapters/metropark/urls.ts
const BASE = 'https://www.metropark.co.il/select-department';

export function buildAppealUrl(type: 'parking' | 'enforcement', authorityId: string): string {
  const action = type === 'parking' ? 'select-parking-action' : 'select-supervision-action';
  return `${BASE}/${action}/?AuthorityId=${authorityId}`;
}

export function buildSearchUrl(
  type: 'parking' | 'enforcement',
  authorityId: string,
  reportId: string,
  identifier: string,
): string {
  const action = type === 'parking' ? 'select-parking-action' : 'select-supervision-action';
  const idParam = type === 'parking'
    ? `LicenseNumber=${identifier}`
    : `ReportOwnerIdOrCompanyId=${identifier}`;
  return `${BASE}/${action}/payment/search-${type}-report/?ReportId=${reportId}&AuthorityId=${authorityId}&${idParam}`;
}
```

## Adapter Registry

```typescript
// src/adapters/registry.ts
import { MetroparkAdapter } from './metropark/metropark-adapter';
import { LolaAdapter } from './lola/lola-adapter';

const adapters: Map<string, SiteAdapter> = new Map();

export function registerAdapter(adapter: SiteAdapter) {
  adapters.set(adapter.slug, adapter);
}

export function getAdapter(slug: string): SiteAdapter {
  const adapter = adapters.get(slug);
  if (!adapter) throw new Error(`No adapter registered for site: ${slug}`);
  return adapter;
}

// Register all adapters at startup
registerAdapter(new MetroparkAdapter());
registerAdapter(new LolaAdapter());
```

## Adding a New Site

To add a new site (e.g., Mitar):

1. Create `src/adapters/mitar/` directory
2. Implement `MitarAdapter extends BaseAdapter`
3. Add `selectors.ts`, `urls.ts`, `field-mapping.ts`
4. Register in `registry.ts`: `registerAdapter(new MitarAdapter())`
5. Add `Site` and `Issuer` records to DB seed
6. Write tests: `mitar-adapter.test.ts`

Zero changes to worker, API, or UI code.
