/**
 * Browser Bridge for Container Agent
 * Polls data/ipc/main/browser/ for request files from the container,
 * forwards them to Chrome via Playwright CDP, writes response files back.
 * Main group only.
 */

import fs from 'fs';
import path from 'path';
import { chromium, Browser, BrowserContext, Page } from 'playwright-core';

import { DATA_DIR, IPC_POLL_INTERVAL, MAIN_GROUP_FOLDER } from './config.js';
import { logger } from './logger.js';

const CDP_URL = process.env.CDP_URL || 'http://localhost:9222';
const BROWSER_IPC_DIR = path.join(DATA_DIR, 'ipc', MAIN_GROUP_FOLDER, 'browser');
const DEFAULT_TIMEOUT = 30_000;

let browser: Browser | null = null;
let context: BrowserContext | null = null;

async function getContext(): Promise<BrowserContext> {
  if (context) {
    try {
      await context.pages();
      return context;
    } catch {
      browser = null;
      context = null;
    }
  }

  browser = await chromium.connectOverCDP(CDP_URL, { timeout: 10_000 });
  const contexts = browser.contexts();
  if (contexts.length === 0) {
    throw new Error('No browser contexts found');
  }
  context = contexts[0];

  browser.on('disconnected', () => {
    browser = null;
    context = null;
  });

  return context;
}

async function getActivePage(): Promise<Page> {
  const ctx = await getContext();
  const pages = ctx.pages();
  return pages.length > 0 ? pages[pages.length - 1] : ctx.newPage();
}

interface BrowserRequest {
  action: string;
  params: Record<string, unknown>;
}

async function handleAction(req: BrowserRequest): Promise<unknown> {
  const page = await getActivePage();

  switch (req.action) {
    case 'navigate': {
      const url = req.params.url as string;
      await page.goto(url, { timeout: DEFAULT_TIMEOUT, waitUntil: 'domcontentloaded' });
      return { url: page.url(), title: await page.title() };
    }

    case 'snapshot': {
      const yaml = await page.locator('body').ariaSnapshot({ timeout: 30_000 });
      if (!yaml || !yaml.trim()) return { text: 'No accessible content' };

      const interactivePattern = /^(\s*-\s*)(link|button|textbox|checkbox|radio|combobox|menuitem|tab|switch|slider|spinbutton|searchbox|option|menuitemcheckbox|menuitemradio|treeitem)\b/;
      let idx = 0;
      const annotated = yaml.split('\n').map((line) => {
        if (interactivePattern.test(line)) return `${line} [ref=${idx++}]`;
        return line;
      }).join('\n');

      return { title: await page.title(), url: page.url(), snapshot: annotated };
    }

    case 'click': {
      const selector = req.params.selector as string;
      await page.locator(selector).first().click({ timeout: DEFAULT_TIMEOUT });
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      return { success: true };
    }

    case 'fill': {
      const selector = req.params.selector as string;
      const value = req.params.value as string;
      await page.locator(selector).first().fill(value, { timeout: DEFAULT_TIMEOUT });
      return { success: true };
    }

    case 'select': {
      const selector = req.params.selector as string;
      const value = req.params.value as string;
      await page.locator(selector).first().selectOption(value, { timeout: DEFAULT_TIMEOUT });
      return { success: true };
    }

    case 'screenshot': {
      const fullPage = req.params.fullPage as boolean | undefined;
      const buffer = await page.screenshot({ fullPage: !!fullPage, timeout: DEFAULT_TIMEOUT });
      return { image: buffer.toString('base64') };
    }

    case 'get_text': {
      const selector = req.params.selector as string | undefined;
      let text: string;
      if (selector) {
        text = (await page.locator(selector).first().textContent({ timeout: DEFAULT_TIMEOUT })) || '';
      } else {
        text = await page.innerText('body', { timeout: DEFAULT_TIMEOUT });
      }
      if (text.length > 50_000) text = text.slice(0, 50_000) + '\n... (truncated)';
      return { text };
    }

    case 'eval': {
      const expression = req.params.expression as string;
      const result = await page.evaluate(expression);
      return { result };
    }

    case 'wait': {
      const selector = req.params.selector as string | undefined;
      const timeoutMs = (req.params.timeout_ms as number) || 5000;
      if (selector) {
        await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs });
      } else {
        await page.waitForTimeout(timeoutMs);
      }
      return { success: true };
    }

    case 'tabs': {
      const ctx = await getContext();
      const pages = ctx.pages();
      return Promise.all(pages.map(async (p, i) => ({
        index: i, url: p.url(), title: await p.title(),
      })));
    }

    case 'switch_tab': {
      const ctx = await getContext();
      const pages = ctx.pages();
      let target: Page | undefined;
      if (req.params.index !== undefined) {
        target = pages[req.params.index as number];
      } else if (req.params.url_pattern) {
        target = pages.find(p => p.url().includes(req.params.url_pattern as string));
      }
      if (!target) throw new Error('Tab not found');
      await target.bringToFront();
      return { success: true, url: target.url(), title: await target.title() };
    }

    case 'back': {
      await page.evaluate(() => (globalThis as any).history.back());
      await page.waitForTimeout(1000);
      return { success: true, url: page.url() };
    }

    case 'forward': {
      await page.evaluate(() => (globalThis as any).history.forward());
      await page.waitForTimeout(1000);
      return { success: true, url: page.url() };
    }

    default:
      throw new Error(`Unknown browser action: ${req.action}`);
  }
}

async function processRequests(): Promise<void> {
  if (!fs.existsSync(BROWSER_IPC_DIR)) return;

  let files: string[];
  try {
    files = fs.readdirSync(BROWSER_IPC_DIR).filter(f => f.endsWith('.request.json'));
  } catch {
    return;
  }

  for (const file of files) {
    const reqPath = path.join(BROWSER_IPC_DIR, file);
    const resPath = path.join(BROWSER_IPC_DIR, file.replace('.request.json', '.response.json'));

    try {
      const raw = fs.readFileSync(reqPath, 'utf-8');
      const req: BrowserRequest = JSON.parse(raw);

      logger.debug({ action: req.action }, 'Browser bridge: processing request');

      const result = await handleAction(req);
      const response = { success: true, result };
      fs.writeFileSync(resPath + '.tmp', JSON.stringify(response));
      fs.renameSync(resPath + '.tmp', resPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ file, error: msg }, 'Browser bridge: request failed');
      const response = { success: false, error: msg };
      fs.writeFileSync(resPath + '.tmp', JSON.stringify(response));
      fs.renameSync(resPath + '.tmp', resPath);
    } finally {
      try { fs.unlinkSync(reqPath); } catch { /* ignore */ }
    }
  }
}

let running = false;

export function startBrowserBridge(): void {
  if (running) return;
  running = true;

  fs.mkdirSync(BROWSER_IPC_DIR, { recursive: true });

  const loop = async () => {
    try {
      await processRequests();
    } catch (err) {
      logger.error({ err }, 'Browser bridge loop error');
    }
    setTimeout(loop, IPC_POLL_INTERVAL);
  };

  loop();
  logger.info('Browser bridge started (main group only)');
}
