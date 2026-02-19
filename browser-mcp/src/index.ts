/**
 * Browser MCP Server
 * Controls the user's real Chrome browser via Chrome DevTools Protocol.
 * Connects lazily on first tool call, reconnects on disconnect.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { chromium, Browser, BrowserContext, Page } from 'playwright-core';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'browser-actions.log');
const LOG_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
const CDP_URL = process.env.CDP_URL || 'http://localhost:9222';
const DEFAULT_TIMEOUT = 30_000;

// --- Logging ---

function ensureLogDir(): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotateLogIfNeeded(): void {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > LOG_MAX_SIZE) {
      const oldFile = LOG_FILE + '.old';
      if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      fs.renameSync(LOG_FILE, oldFile);
    }
  } catch { /* ignore */ }
}

function cleanOldLogEntries(): void {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const cutoff = Date.now() - LOG_MAX_AGE_MS;
    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = content.split('\n').filter((line) => {
      if (!line.trim()) return false;
      try {
        const entry = JSON.parse(line);
        return new Date(entry.timestamp).getTime() > cutoff;
      } catch {
        return true; // keep unparseable lines
      }
    });
    fs.writeFileSync(LOG_FILE, lines.join('\n') + (lines.length ? '\n' : ''));
  } catch { /* ignore */ }
}

function logAction(action: string, params: Record<string, unknown>, durationMs: number, success: boolean, result?: string, error?: string): void {
  try {
    rotateLogIfNeeded();
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      params,
      durationMs,
      success,
      ...(result && { result: result.slice(0, 500) }),
      ...(error && { error: error.slice(0, 500) }),
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch { /* ignore */ }
}

// --- Browser Connection ---

let browser: Browser | null = null;
let context: BrowserContext | null = null;

async function getContext(): Promise<BrowserContext> {
  if (context) {
    try {
      // Test if still connected
      await context.pages();
      return context;
    } catch {
      browser = null;
      context = null;
    }
  }

  try {
    browser = await chromium.connectOverCDP(CDP_URL, { timeout: 10_000 });
  } catch {
    throw new Error(
      `Chrome not running with CDP. Run: scripts/launch-chrome.sh`
    );
  }

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    throw new Error('No browser contexts found. Open a Chrome window first.');
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
  if (pages.length === 0) {
    return ctx.newPage();
  }
  // Return the last page (most recently focused)
  return pages[pages.length - 1];
}

// --- Accessibility Snapshot ---
// Uses Playwright's ariaSnapshot() which returns a YAML representation
// of the accessibility tree. We add ref numbers to interactive elements.

async function buildSnapshot(page: Page): Promise<string> {
  const yaml = await page.locator('body').ariaSnapshot({ timeout: DEFAULT_TIMEOUT });
  if (!yaml || !yaml.trim()) return 'Page has no accessible content.';

  // Add ref numbers to interactive elements in the YAML
  const interactiveRoles = /^(\s*-\s*)(link|button|textbox|checkbox|radio|combobox|menuitem|tab|switch|slider|spinbutton|searchbox|option|menuitemcheckbox|menuitemradio|treeitem)\b/;
  let idx = 0;
  const lines = yaml.split('\n').map((line) => {
    if (interactiveRoles.test(line)) {
      return `${line} [ref=${idx++}]`;
    }
    return line;
  });
  return lines.join('\n');
}

async function getElementBySelector(page: Page, selector: string) {
  // If selector starts with "role=", use it directly
  if (selector.startsWith('role=')) {
    return page.locator(selector).first();
  }
  // Otherwise treat as CSS selector
  return page.locator(selector).first();
}

// --- Timed wrapper ---

async function timed<T>(action: string, params: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logAction(action, params, Date.now() - start, true, typeof result === 'string' ? result : JSON.stringify(result));
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logAction(action, params, Date.now() - start, false, undefined, msg);
    throw err;
  }
}

// --- MCP Server ---

const server = new McpServer({
  name: 'browser',
  version: '1.0.0',
});

server.tool(
  'browser_navigate',
  'Navigate to a URL in the browser',
  { url: z.string().describe('The URL to navigate to') },
  async (args) => {
    return timed('navigate', { url: args.url }, async () => {
      const page = await getActivePage();
      await page.goto(args.url, { timeout: DEFAULT_TIMEOUT, waitUntil: 'domcontentloaded' });
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ url: page.url(), title: await page.title() }),
        }],
      };
    });
  },
);

server.tool(
  'browser_snapshot',
  'Get an accessibility snapshot of the current page. Returns interactive elements with ref numbers you can use with browser_click, browser_fill, etc.',
  {},
  async () => {
    return timed('snapshot', {}, async () => {
      const page = await getActivePage();
      const snap = await buildSnapshot(page);
      return {
        content: [{
          type: 'text' as const,
          text: `Page: ${await page.title()} (${page.url()})\n\n${snap}`,
        }],
      };
    });
  },
);

server.tool(
  'browser_click',
  'Click an element on the page',
  { selector: z.string().describe('CSS selector or ref number from snapshot') },
  async (args) => {
    return timed('click', { selector: args.selector }, async () => {
      const page = await getActivePage();
      const el = await getElementBySelector(page, args.selector);
      await el.click({ timeout: DEFAULT_TIMEOUT });
      // Wait for any navigation or network activity to settle
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }],
      };
    });
  },
);

server.tool(
  'browser_fill',
  'Fill a text input field',
  {
    selector: z.string().describe('CSS selector or ref number from snapshot'),
    value: z.string().describe('Text to type into the field'),
  },
  async (args) => {
    return timed('fill', { selector: args.selector }, async () => {
      const page = await getActivePage();
      const el = await getElementBySelector(page, args.selector);
      await el.fill(args.value, { timeout: DEFAULT_TIMEOUT });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }],
      };
    });
  },
);

server.tool(
  'browser_select',
  'Select an option from a dropdown',
  {
    selector: z.string().describe('CSS selector or ref number from snapshot'),
    value: z.string().describe('Value or label to select'),
  },
  async (args) => {
    return timed('select', { selector: args.selector, value: args.value }, async () => {
      const page = await getActivePage();
      const el = await getElementBySelector(page, args.selector);
      await el.selectOption(args.value, { timeout: DEFAULT_TIMEOUT });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }],
      };
    });
  },
);

server.tool(
  'browser_screenshot',
  'Take a screenshot of the current page',
  { fullPage: z.boolean().optional().default(false).describe('Capture the full scrollable page') },
  async (args) => {
    return timed('screenshot', { fullPage: args.fullPage }, async () => {
      const page = await getActivePage();
      const buffer = await page.screenshot({ fullPage: args.fullPage, timeout: DEFAULT_TIMEOUT });
      return {
        content: [{
          type: 'image' as const,
          data: buffer.toString('base64'),
          mimeType: 'image/png',
        }],
      };
    });
  },
);

server.tool(
  'browser_get_text',
  'Get text content from the page or a specific element',
  { selector: z.string().optional().describe('CSS selector or ref number. If omitted, returns full page text.') },
  async (args) => {
    return timed('get_text', { selector: args.selector }, async () => {
      const page = await getActivePage();
      let text: string;
      if (args.selector) {
        const el = await getElementBySelector(page, args.selector);
        text = (await el.textContent({ timeout: DEFAULT_TIMEOUT })) || '';
      } else {
        text = await page.innerText('body', { timeout: DEFAULT_TIMEOUT });
      }
      // Truncate to avoid overwhelming the context
      if (text.length > 50_000) text = text.slice(0, 50_000) + '\n... (truncated)';
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ text }) }],
      };
    });
  },
);

server.tool(
  'browser_eval',
  'Execute JavaScript in the browser console',
  { expression: z.string().describe('JavaScript expression to evaluate') },
  async (args) => {
    return timed('eval', { expression: args.expression.slice(0, 200) }, async () => {
      const page = await getActivePage();
      const result = await page.evaluate(args.expression);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ result }) }],
      };
    });
  },
);

server.tool(
  'browser_wait',
  'Wait for an element to appear or a timeout',
  {
    selector: z.string().optional().describe('CSS selector to wait for'),
    timeout_ms: z.number().optional().default(5000).describe('Milliseconds to wait (default 5000)'),
  },
  async (args) => {
    return timed('wait', { selector: args.selector, timeout_ms: args.timeout_ms }, async () => {
      const page = await getActivePage();
      if (args.selector) {
        const el = await getElementBySelector(page, args.selector);
        await el.waitFor({ state: 'visible', timeout: args.timeout_ms });
      } else {
        await page.waitForTimeout(args.timeout_ms!);
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }],
      };
    });
  },
);

server.tool(
  'browser_tabs',
  'List all open browser tabs',
  {},
  async () => {
    return timed('tabs', {}, async () => {
      const ctx = await getContext();
      const pages = ctx.pages();
      const tabs = await Promise.all(
        pages.map(async (p, i) => ({
          index: i,
          url: p.url(),
          title: await p.title(),
        })),
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(tabs, null, 2) }],
      };
    });
  },
);

server.tool(
  'browser_switch_tab',
  'Switch to a different browser tab',
  {
    index: z.number().optional().describe('Tab index (from browser_tabs)'),
    url_pattern: z.string().optional().describe('Substring to match against tab URLs'),
  },
  async (args) => {
    return timed('switch_tab', args, async () => {
      const ctx = await getContext();
      const pages = ctx.pages();

      let target: Page | undefined;
      if (args.index !== undefined) {
        target = pages[args.index];
      } else if (args.url_pattern) {
        target = pages.find((p) => p.url().includes(args.url_pattern!));
      }

      if (!target) throw new Error('Tab not found');
      await target.bringToFront();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, url: target.url(), title: await target.title() }),
        }],
      };
    });
  },
);

server.tool(
  'browser_back',
  'Navigate back in browser history',
  {},
  async () => {
    return timed('back', {}, async () => {
      const page = await getActivePage();
      // Playwright goBack() hangs on cross-origin CDP navigations.
      // Use JS history.back() + short wait instead.
      await page.evaluate(() => history.back());
      await page.waitForTimeout(1000);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, url: page.url() }),
        }],
      };
    });
  },
);

server.tool(
  'browser_forward',
  'Navigate forward in browser history',
  {},
  async () => {
    return timed('forward', {}, async () => {
      const page = await getActivePage();
      await page.evaluate(() => history.forward());
      await page.waitForTimeout(1000);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, url: page.url() }),
        }],
      };
    });
  },
);

// --- Startup ---

ensureLogDir();
cleanOldLogEntries();

// Schedule daily log cleanup
setInterval(cleanOldLogEntries, 24 * 60 * 60 * 1000);

const transport = new StdioServerTransport();
await server.connect(transport);
