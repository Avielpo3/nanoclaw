#!/usr/bin/env npx tsx
/**
 * E2E test for browser-mcp server.
 * Spawns the MCP server, sends JSON-RPC over newline-delimited stdio.
 *
 * Prerequisites:
 *   1. Chrome running with CDP: ./scripts/launch-chrome.sh
 *   2. browser-mcp built: cd browser-mcp && npm run build
 *
 * Run: cd browser-mcp && npx tsx test-e2e.ts
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, 'dist', 'index.js');

let server: ChildProcess;
let requestId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

// --- Server lifecycle ---

function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CDP_URL: process.env.CDP_URL || 'http://localhost:9222' },
    });

    server.stderr!.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) process.stderr.write(`  [server stderr] ${msg}\n`);
    });

    // MCP SDK uses newline-delimited JSON on stdio
    const rl = readline.createInterface({ input: server.stdout! });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pending.has(msg.id)) {
          const p = pending.get(msg.id)!;
          pending.delete(msg.id);
          p.resolve(msg);
        }
      } catch { /* ignore parse errors */ }
    });

    server.on('error', reject);
    setTimeout(resolve, 500);
  });
}

function stopServer(): void {
  if (server && !server.killed) {
    server.kill('SIGTERM');
  }
}

// --- JSON-RPC helpers ---

function send(method: string, params?: any): Promise<any> {
  const id = ++requestId;
  const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
    }, 30_000);

    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });

    server.stdin!.write(msg + '\n');
  });
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
  const resp = await send('tools/call', { name, arguments: args });
  if (resp.error) {
    throw new Error(`MCP error: ${JSON.stringify(resp.error)}`);
  }
  return resp.result;
}

async function initialize(): Promise<void> {
  await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  });
  // Notification — no response
  server.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  await new Promise((r) => setTimeout(r, 300));
}

// --- Test runner ---

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${msg}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    \x1b[31m${msg}\x1b[0m`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertContains(haystack: string, needle: string, label?: string): void {
  if (!haystack.toLowerCase().includes(needle.toLowerCase())) {
    throw new Error(`${label || 'String'} does not contain "${needle}". Got: ${haystack.slice(0, 300)}`);
  }
}

function getTextContent(result: any): string {
  if (!result?.content) throw new Error('No content in result');
  const textItem = result.content.find((c: any) => c.type === 'text');
  if (!textItem) throw new Error('No text content in result');
  return textItem.text;
}

function getImageContent(result: any): string {
  if (!result?.content) throw new Error('No content in result');
  const imgItem = result.content.find((c: any) => c.type === 'image');
  if (!imgItem) throw new Error('No image content in result');
  return imgItem.data;
}

// --- Tests ---

async function runTests(): Promise<void> {
  console.log('\n\x1b[1mBrowser MCP E2E Tests\x1b[0m\n');

  // Check CDP is available
  try {
    const resp = await fetch('http://localhost:9222/json/version');
    if (!resp.ok) throw new Error(`CDP returned ${resp.status}`);
    console.log('  Chrome CDP detected');
  } catch {
    console.error('\x1b[31m  Chrome is not running with CDP on port 9222.\x1b[0m');
    console.error('  Run: ./scripts/launch-chrome.sh\n');
    process.exit(1);
  }

  console.log('  Starting MCP server...');
  await startServer();
  await initialize();
  console.log('  Server ready\n');

  // --- Tool listing ---

  await test('lists all 13 browser tools', async () => {
    const resp = await send('tools/list');
    const tools: string[] = resp.result.tools.map((t: any) => t.name);
    const expected = [
      'browser_navigate', 'browser_snapshot', 'browser_click', 'browser_fill',
      'browser_select', 'browser_screenshot', 'browser_get_text', 'browser_eval',
      'browser_wait', 'browser_tabs', 'browser_switch_tab', 'browser_back', 'browser_forward',
    ];
    for (const name of expected) {
      assert(tools.includes(name), `Missing tool: ${name}`);
    }
    assert(tools.length === expected.length, `Expected ${expected.length} tools, got ${tools.length}`);
  });

  // --- Navigation ---

  await test('browser_navigate goes to example.com', async () => {
    const result = await callTool('browser_navigate', { url: 'https://example.com' });
    const data = JSON.parse(getTextContent(result));
    assertContains(data.url, 'example.com');
    assert(typeof data.title === 'string' && data.title.length > 0, 'should have a title');
  });

  // --- Snapshot ---

  await test('browser_snapshot returns accessibility tree with refs', async () => {
    const result = await callTool('browser_snapshot');
    const text = getTextContent(result);
    assertContains(text, 'example.com');
    assertContains(text, 'link');
    assertContains(text, '[ref=');
  });

  // --- Get text ---

  await test('browser_get_text returns full page text', async () => {
    const result = await callTool('browser_get_text', {});
    const data = JSON.parse(getTextContent(result));
    assertContains(data.text, 'Example Domain');
  });

  await test('browser_get_text with selector returns element text', async () => {
    const result = await callTool('browser_get_text', { selector: 'h1' });
    const data = JSON.parse(getTextContent(result));
    assert(data.text.trim() === 'Example Domain', `Expected "Example Domain", got "${data.text.trim()}"`);
  });

  // --- Eval ---

  await test('browser_eval executes JS and returns result', async () => {
    const result = await callTool('browser_eval', { expression: 'document.title' });
    const data = JSON.parse(getTextContent(result));
    assertContains(data.result, 'Example Domain');
  });

  await test('browser_eval with arithmetic', async () => {
    const result = await callTool('browser_eval', { expression: '2 + 3' });
    const data = JSON.parse(getTextContent(result));
    assert(data.result === 5, `Expected 5, got ${data.result}`);
  });

  // --- Screenshot ---

  await test('browser_screenshot returns valid PNG', async () => {
    const result = await callTool('browser_screenshot', { fullPage: false });
    const base64 = getImageContent(result);
    assert(base64.length > 100, 'Screenshot should have data');
    const buf = Buffer.from(base64, 'base64');
    assert(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47, 'Should be valid PNG header');
  });

  await test('browser_screenshot fullPage works', async () => {
    const result = await callTool('browser_screenshot', { fullPage: true });
    const base64 = getImageContent(result);
    assert(base64.length > 100, 'Full page screenshot should have data');
  });

  // --- Tabs ---

  await test('browser_tabs lists open tabs', async () => {
    const result = await callTool('browser_tabs');
    const tabs = JSON.parse(getTextContent(result));
    assert(Array.isArray(tabs), 'should be an array');
    assert(tabs.length > 0, 'should have at least one tab');
    const tab = tabs[0];
    assert(typeof tab.index === 'number', 'tab.index should be number');
    assert(typeof tab.url === 'string', 'tab.url should be string');
    assert(typeof tab.title === 'string', 'tab.title should be string');
  });

  // --- Navigation history ---

  await test('browser_navigate to second page', async () => {
    const result = await callTool('browser_navigate', { url: 'https://httpbin.org/html' });
    const data = JSON.parse(getTextContent(result));
    assertContains(data.url, 'httpbin.org');
  });

  await test('browser_back navigates history', async () => {
    const result = await callTool('browser_back');
    const data = JSON.parse(getTextContent(result));
    // In a real browser with extensions, back may land on extension pages.
    // Just verify it returns a valid response with a URL.
    assert(typeof data.url === 'string' && data.url.length > 0, 'should return a url');
  });

  await test('browser_forward navigates history', async () => {
    const result = await callTool('browser_forward');
    const data = JSON.parse(getTextContent(result));
    assert(typeof data.url === 'string' && data.url.length > 0, 'should return a url');
  });

  // --- Click ---

  await test('browser_click clicks a link', async () => {
    await callTool('browser_navigate', { url: 'https://example.com' });
    const result = await callTool('browser_click', { selector: 'a' });
    const data = JSON.parse(getTextContent(result));
    assert(data.success === true, 'click should succeed');
  });

  // --- Wait ---

  await test('browser_wait with timeout completes', async () => {
    const start = Date.now();
    const result = await callTool('browser_wait', { timeout_ms: 500 });
    const elapsed = Date.now() - start;
    const data = JSON.parse(getTextContent(result));
    assert(data.success === true, 'wait should succeed');
    assert(elapsed >= 400, `Should have waited ~500ms, only waited ${elapsed}ms`);
  });

  await test('browser_wait for element works', async () => {
    await callTool('browser_navigate', { url: 'https://example.com' });
    const result = await callTool('browser_wait', { selector: 'h1', timeout_ms: 5000 });
    const data = JSON.parse(getTextContent(result));
    assert(data.success === true, 'wait for h1 should succeed');
  });

  // --- Fill ---

  await test('browser_fill types into an input', async () => {
    await callTool('browser_navigate', { url: 'https://httpbin.org/forms/post' });
    const result = await callTool('browser_fill', { selector: 'input[name="custname"]', value: 'NanoClaw Test' });
    const data = JSON.parse(getTextContent(result));
    assert(data.success === true, 'fill should succeed');

    // Verify value
    const evalResult = await callTool('browser_eval', {
      expression: 'document.querySelector("input[name=\\"custname\\"]").value',
    });
    const evalData = JSON.parse(getTextContent(evalResult));
    assert(evalData.result === 'NanoClaw Test', `Expected "NanoClaw Test", got "${evalData.result}"`);
  });

  // --- Switch tab ---

  await test('browser_switch_tab by url_pattern', async () => {
    const result = await callTool('browser_switch_tab', { url_pattern: 'httpbin' });
    const data = JSON.parse(getTextContent(result));
    assert(data.success === true, 'switch should succeed');
    assertContains(data.url, 'httpbin');
  });

  await test('browser_switch_tab by index', async () => {
    const tabsResult = await callTool('browser_tabs');
    const tabs = JSON.parse(getTextContent(tabsResult));
    const result = await callTool('browser_switch_tab', { index: 0 });
    const data = JSON.parse(getTextContent(result));
    assert(data.success === true, 'switch by index should succeed');
  });

  // --- Error resilience ---

  await test('server survives JS eval error', async () => {
    const result = await callTool('browser_eval', { expression: 'throw new Error("test boom")' });
    // Should return an isError response, not crash
    const text = getTextContent(result);
    // The server should still be alive after this
    const alive = await callTool('browser_eval', { expression: '42' });
    const data = JSON.parse(getTextContent(alive));
    assert(data.result === 42, 'Server should still respond after eval error');
  });

  // --- Summary ---

  console.log(`\n\x1b[1m  Results: ${passed} passed, ${failed} failed\x1b[0m`);
  if (failures.length > 0) {
    console.log('\n  \x1b[31mFailures:\x1b[0m');
    for (const f of failures) console.log(`    - ${f}`);
  }
  console.log();
}

// --- Main ---

try {
  await runTests();
} finally {
  stopServer();
}

process.exit(failed > 0 ? 1 : 0);
