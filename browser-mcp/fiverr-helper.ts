#!/usr/bin/env npx tsx
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn('node', [path.join(__dirname, 'dist', 'index.js')], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, CDP_URL: process.env.CDP_URL || 'http://localhost:9222' },
});

let requestId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
const rl = readline.createInterface({ input: server.stdout! });
rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      p.resolve(msg);
    }
  } catch {}
});

function send(method: string, params?: any): Promise<any> {
  const id = ++requestId;
  const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout')); }, 60_000);
    pending.set(id, {
      resolve: (v: any) => { clearTimeout(timer); resolve(v); },
      reject: (e: Error) => { clearTimeout(timer); reject(e); },
    });
    server.stdin!.write(msg + '\n');
  });
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
  const resp = await send('tools/call', { name, arguments: args });
  if (resp.error) throw new Error(JSON.stringify(resp.error));
  return resp.result;
}

function getText(result: any): string {
  return result?.content?.find((c: any) => c.type === 'text')?.text || '';
}

await new Promise((r) => setTimeout(r, 500));
await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'helper', version: '1.0.0' } });
server.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
await new Promise((r) => setTimeout(r, 300));

const action = process.argv[2] || 'snapshot';

if (action === 'snapshot') {
  const snap = await callTool('browser_snapshot');
  console.log(getText(snap));
} else if (action === 'url') {
  const r = await callTool('browser_eval', { expression: 'window.location.href' });
  console.log(getText(r));
} else if (action === 'text') {
  const selector = process.argv[3];
  const r = await callTool('browser_get_text', selector ? { selector } : {});
  console.log(getText(r));
} else if (action === 'click') {
  const selector = process.argv[3]!;
  const r = await callTool('browser_click', { selector });
  console.log(getText(r));
} else if (action === 'fill') {
  const selector = process.argv[3]!;
  const value = process.argv[4]!;
  const r = await callTool('browser_fill', { selector, value });
  console.log(getText(r));
} else if (action === 'eval') {
  const expr = process.argv[3]!;
  const r = await callTool('browser_eval', { expression: expr });
  console.log(getText(r));
} else if (action === 'select') {
  const selector = process.argv[3]!;
  const value = process.argv[4]!;
  const r = await callTool('browser_select', { selector, value });
  console.log(getText(r));
} else if (action === 'navigate') {
  const url = process.argv[3]!;
  const r = await callTool('browser_navigate', { url });
  console.log(getText(r));
} else if (action === 'wait') {
  const ms = parseInt(process.argv[3] || '2000');
  await callTool('browser_wait', { timeout_ms: ms });
  console.log('done');
} else if (action === 'screenshot') {
  const r = await callTool('browser_screenshot', { fullPage: true });
  const img = r?.content?.find((c: any) => c.type === 'image');
  if (img) {
    const fs = await import('fs');
    const outPath = process.argv[3] || '/tmp/fiverr-screenshot.png';
    fs.writeFileSync(outPath, Buffer.from(img.data, 'base64'));
    console.log(`Saved to ${outPath}`);
  }
}

server.kill('SIGTERM');
process.exit(0);
