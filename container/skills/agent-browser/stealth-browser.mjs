#!/usr/bin/env node
/**
 * Stealth browser — Playwright with anti-detection for bot-protected sites.
 *
 * Usage:
 *   stealth-browser open <url>              # Open URL, print page title
 *   stealth-browser snapshot <url>          # Open URL, print interactive elements
 *   stealth-browser screenshot <url> [path] # Open URL, take screenshot
 *   stealth-browser html <url>              # Open URL, print page HTML
 *   stealth-browser script <path>           # Run a custom Playwright script
 *
 * The script command runs a .mjs file that receives { browser, page, context } as args.
 * Example: stealth-browser script reserve-tabit.mjs
 */

import { chromium } from 'playwright-core';

const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium';
const TIMEOUT = parseInt(process.env.STEALTH_TIMEOUT || '30000', 10);

async function launchBrowser() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-infobars',
      '--window-size=1920,1080',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    // Mask webdriver detection
    javaScriptEnabled: true,
  });

  // Remove navigator.webdriver flag
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // Override permissions query
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
    // Chrome runtime
    window.chrome = { runtime: {} };
    // Plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    // Languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['he-IL', 'he', 'en-US', 'en'],
    });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);

  return { browser, context, page };
}

async function openUrl(url) {
  const { browser, page } = await launchBrowser();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    const status = response?.status() || 'unknown';
    const title = await page.title();
    console.log(`Status: ${status}`);
    console.log(`Title: ${title}`);
    console.log(`URL: ${page.url()}`);
  } finally {
    await browser.close();
  }
}

async function snapshot(url) {
  const { browser, page } = await launchBrowser();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    // Wait a bit for JS to render
    await page.waitForTimeout(2000);

    // Extract interactive elements
    const elements = await page.evaluate(() => {
      const interactiveSelectors = 'a, button, input, select, textarea, [role="button"], [onclick], [tabindex]';
      const els = document.querySelectorAll(interactiveSelectors);
      return Array.from(els).slice(0, 100).map((el, i) => {
        const tag = el.tagName.toLowerCase();
        const type = el.getAttribute('type') || '';
        const text = (el.textContent || '').trim().slice(0, 80);
        const name = el.getAttribute('name') || '';
        const placeholder = el.getAttribute('placeholder') || '';
        const href = el.getAttribute('href') || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const id = el.id || '';
        const selector = id ? `#${id}` : (name ? `[name="${name}"]` : `${tag}:nth-of-type(${i + 1})`);
        return { ref: `e${i}`, tag, type, text, name, placeholder, href, ariaLabel, selector };
      });
    });

    console.log(`URL: ${page.url()}`);
    console.log(`Title: ${await page.title()}`);
    console.log(`\nInteractive elements (${elements.length}):`);
    for (const el of elements) {
      const desc = [
        el.tag,
        el.type && `type=${el.type}`,
        el.name && `name="${el.name}"`,
        el.placeholder && `placeholder="${el.placeholder}"`,
        el.ariaLabel && `aria="${el.ariaLabel}"`,
        el.text && `"${el.text}"`,
        el.href && `href="${el.href.slice(0, 60)}"`,
      ].filter(Boolean).join(' ');
      console.log(`  [${el.ref}] ${desc}  → selector: ${el.selector}`);
    }
  } finally {
    await browser.close();
  }
}

async function screenshot(url, outputPath) {
  const { browser, page } = await launchBrowser();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForTimeout(2000);
    const path = outputPath || '/tmp/screenshot.png';
    await page.screenshot({ path, fullPage: false });
    console.log(`Screenshot saved to: ${path}`);
  } finally {
    await browser.close();
  }
}

async function getHtml(url) {
  const { browser, page } = await launchBrowser();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForTimeout(2000);
    const html = await page.content();
    console.log(html);
  } finally {
    await browser.close();
  }
}

async function runScript(scriptPath) {
  const { browser, context, page } = await launchBrowser();
  try {
    const mod = await import(scriptPath.startsWith('/') ? scriptPath : `./${scriptPath}`);
    if (typeof mod.default === 'function') {
      await mod.default({ browser, context, page });
    } else {
      console.error('Script must export a default async function({ browser, context, page })');
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

// CLI
const [,, command, ...args] = process.argv;

try {
  switch (command) {
    case 'open':
      await openUrl(args[0]);
      break;
    case 'snapshot':
      await snapshot(args[0]);
      break;
    case 'screenshot':
      await screenshot(args[0], args[1]);
      break;
    case 'html':
      await getHtml(args[0]);
      break;
    case 'script':
      await runScript(args[0]);
      break;
    default:
      console.log(`Usage: stealth-browser <open|snapshot|screenshot|html|script> <url|path>`);
      process.exit(1);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
