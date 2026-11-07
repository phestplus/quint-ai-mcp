import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

async function connect(opts) {
  const server = createServer(opts);
  const client = new Client({ name: 'test', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, close: () => Promise.all([client.close(), server.close()]) };
}

test('lists all tools and prompts', async () => {
  const { client, close } = await connect();
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(tools, ['asset_brief', 'asset_upload', 'brand_extract', 'brand_profile', 'campaign_go', 'cloud_account', 'connect_domain', 'content_kit', 'content_plan', 'event_calendar', 'export_plan', 'find_images', 'illustrate', 'kit_edit', 'landing_page', 'page_stats', 'platform_specs', 'publish_page', 'report_issue', 'start_campaign', 'studio_photo', 'unpublish', 'video', 'whats_on']);
  const prompts = (await client.listPrompts()).prompts.map((p) => p.name).sort();
  assert.deepEqual(prompts, ['quint-campaign', 'quint-video-script']);
  await close();
});

test('event_calendar returns events', async () => {
  const { client, close } = await connect();
  const r = await client.callTool({ name: 'event_calendar', arguments: { year: 2026, regions: ['US'], minImpact: 'high', includePast: true } });
  const data = JSON.parse(r.content[0].text);
  assert.ok(data.events.some((e) => e.id === 'black-friday' && e.date === '2026-11-27'));
  await close();
});

test('unknown places are reported, not fatal', async () => {
  const { client, close } = await connect();
  const r = await client.callTool({ name: 'event_calendar', arguments: { regions: ['MARS'] } });
  assert.ok(!r.isError);
  assert.deepEqual(JSON.parse(r.content[0].text).unknownPlaces, ['mars']);
  const bad = await client.callTool({ name: 'event_calendar', arguments: { from: '2026-13-01' } });
  assert.equal(bad.isError, true, 'malformed dates are still rejected');
  await close();
});

test('file writes are refused in remote mode', async () => {
  const { client, close } = await connect({ allowFileWrites: false });
  const r = await client.callTool({ name: 'landing_page', arguments: { brand: 'a', headline: 'b', ctaText: 'c', ctaUrl: 'https://x.y', outputPath: 'x.html', autoImages: false } });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /only supported when the server runs locally/);
  await close();
});

test('export_plan returns ICS', async () => {
  const { client, close } = await connect();
  const r = await client.callTool({ name: 'export_plan', arguments: { brand: 'Glow', niche: 'skincare', platforms: ['instagram'], startDate: '2026-11-20', endDate: '2026-11-30', as: 'ics' } });
  assert.match(r.content[0].text, /BEGIN:VCALENDAR/);
  await close();
});

test('loose input: platforms, places and event names in plain words', async () => {
  const { client, close } = await connect();
  const r = await client.callTool({ name: 'content_plan', arguments: { brand: 'Kora', niche: 'sneakers', platforms: 'ig, tik tok and whatsapp', regions: 'Lagos', startDate: '2026-11-02', endDate: '2026-12-02', focusEvents: ['black friday'] } });
  assert.ok(!r.isError, r.content[0].text);
  const plan = JSON.parse(r.content[0].text);
  assert.deepEqual(plan.interpreted.platforms, ['instagram', 'tiktok', 'whatsapp']);
  assert.deepEqual(plan.interpreted.regions, ['NG']);
  assert.ok(plan.eventsCovered.some((e) => e.id === 'black-friday'));
  await close();
});

test('start_campaign understands a messy request without live data', async () => {
  const { client, close } = await connect();
  const r = await client.callTool({ name: 'start_campaign', arguments: { description: 'i sell sneakers in lagos, need bf content for ig and whatsapp, 30 percent off', live: false } });
  const d = JSON.parse(r.content[0].text);
  assert.equal(d.understood.niche.id, 'footwear');
  assert.equal(d.understood.offer.value, 30);
  assert.equal(d.understood.currency, 'NGN');
  assert.ok(d.questions.every((q) => q.blocking === false));
  assert.equal(d.canProceed, true);
  await close();
});

test('studio_photo enhances a local photo (background removal when rembg is present)', { timeout: 60000 }, async () => {
  const { mkdtempSync, writeFileSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'q4studio-'));
  const src = join(dir, 'shoe.png');
  try {
    execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', `from PIL import Image, ImageDraw\nim=Image.new('RGB',(800,600),(180,170,150))\nd=ImageDraw.Draw(im)\nd.ellipse((200,250,600,420),fill=(240,240,240))\nim.save(r'${src}')`]);
  } catch { return; } // no Python + Pillow on this machine: nothing to test
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const server = createServer({ allowFileWrites: true });
  const client = new Client({ name: 't', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const r = await client.callTool({ name: 'studio_photo', arguments: { input: src, background: '#111111', size: 800 } });
  assert.ok(!r.isError, r.content[0].text);
  const out = JSON.parse(r.content[0].text);
  assert.ok(existsSync(out.output));
  assert.equal(typeof out.removedBackground, 'boolean');
  const hosted = createServer({ allowFileWrites: false });
  const c2 = new Client({ name: 't2', version: '0' });
  const [a2, b2] = InMemoryTransport.createLinkedPair();
  await Promise.all([hosted.connect(a2), c2.connect(b2)]);
  assert.match((await c2.callTool({ name: 'studio_photo', arguments: { input: src } })).content[0].text, /runs on your own computer/);
  await client.close(); await c2.close();
});
