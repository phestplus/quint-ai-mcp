// End-to-end: run the bundled dist/server.mjs from an empty folder (no node_modules),
// over stdio and over HTTP, the way plugins and remote clients use it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const bundle = new URL('../dist/server.mjs', import.meta.url);
const skip = !existsSync(bundle) && 'run npm run build first';

function isolated() {
  const dir = mkdtempSync(join(tmpdir(), 'quint-e2e-'));
  const file = join(dir, 'server.mjs');
  copyFileSync(bundle, file);
  return { dir, file };
}

test('bundle works over stdio without node_modules', { skip, timeout: 30000 }, async () => {
  const { dir, file } = isolated();
  const client = new Client({ name: 'e2e', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [file], cwd: dir }));
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 24);
    const out = join(dir, 'page.html');
    const r = await client.callTool({ name: 'landing_page', arguments: { brand: 'Glow', headline: 'Sale', ctaText: 'Shop', ctaUrl: 'https://x.y', outputPath: out, autoImages: false } });
    assert.ok(!r.isError, r.content[0].text);
    assert.ok(existsSync(out));
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bundle works over HTTP (remote clients such as ChatGPT)', { skip, timeout: 30000 }, async () => {
  const { dir, file } = isolated();
  const port = 39000 + Math.floor(Math.random() * 1000);
  const proc = spawn(process.execPath, [file, '--http', '--port', String(port), '--host', '127.0.0.1'], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    await new Promise((res, rej) => {
      proc.stderr.on('data', (d) => String(d).includes('listening') && res());
      proc.on('exit', (c) => rej(new Error(`server exited ${c}`)));
    });
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(health.ok, true);

    const client = new Client({ name: 'e2e-http', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    const r = await client.callTool({ name: 'event_calendar', arguments: { year: 2026, minImpact: 'high', includePast: true } });
    assert.ok(JSON.parse(r.content[0].text).events.some((e) => e.id === 'christmas'));
    const w = await client.callTool({ name: 'landing_page', arguments: { brand: 'a', headline: 'b', ctaText: 'c', ctaUrl: 'https://x.y', outputPath: 'evil.html', autoImages: false } });
    assert.equal(w.isError, true, 'remote mode must not write files');
    await client.close();

    const big = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(1_100_000) });
    assert.equal(big.status, 413);
  } finally {
    const exited = new Promise((res) => proc.once('exit', res));
    proc.kill();
    await exited;
    rmSync(dir, { recursive: true, force: true });
  }
});
