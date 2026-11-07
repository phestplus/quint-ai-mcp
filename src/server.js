import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildBrief, ASSET_TYPES } from './brief.js';
import { EVENT_IDS, listEvents, relevance } from './calendar.js';
import { NO_KEY, createCloud } from './cloud.js';
import { findImages, matchingImages, typeWords } from './images.js';
import { ASK_RULE, questionsFor } from './ask.js';
import { upcomingHolidays, whatsOn } from './live.js';
import { NICHES, classifyNiche } from './niches.js';
import { MOOD_QUERIES } from './start.js';
import { findEventsInText, normalizePlatforms, normalizeRegions } from './normalize.js';
import { startCampaign } from './start.js';
import { CATEGORIES, REGIONS } from './events.js';
import { toCSV, toICS, toMarkdown } from './export.js';
import { buildLanding, describeLanding, LAYOUTS, THEMES } from './landing.js';
import { buildPlan } from './plan.js';
import { buildKit } from './kit.js';
import { checkOutput } from './checks.js';
import { extractBrand } from './extract.js';
import { ACCEPTANCE, SCENES, STYLES, handoff, promptFor } from './illustrate.js';
import { tmpdir } from 'node:os';
import { getSpecs, PLATFORM_IDS } from './specs.js';

export const VERSION = '0.8.0';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
// Loose inputs: real users write "ig, tik tok", "Lagos", "black friday". Normalised in the engine.
const list = z.union([z.array(z.string()), z.string()]);
const platformList = list.describe(`Platforms, any spelling: ${PLATFORM_IDS.join(', ')} (also "ig", "tik tok", "newsletter", "status")`);
const regionList = list.describe('Countries, cities or codes, e.g. "Nigeria", "Lagos", "US", "UK", "worldwide"');
const eventRef = (id) => (EVENT_IDS.includes(id) ? id : findEventsInText(id ?? '')[0] ?? id);

const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (err) => ({ isError: true, content: [{ type: 'text', text: `Error: ${err.message}` }] });
const wrap = (fn) => async (args) => { try { return await fn(args); } catch (e) { return fail(e); } };

/** @param {{ allowFileWrites?: boolean }} opts */
export function createServer({ allowFileWrites = false } = {}) {
  const server = new McpServer({ name: 'quint-ai', version: VERSION });
  const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
  const brandStyle = z.object({
    mode: z.enum(['light', 'dark']).optional(),
    palette: z.object({ bg: hexColor.optional(), surface: hexColor.optional(), text: hexColor.optional(), muted: hexColor.optional(), accent: hexColor.optional(), accent2: hexColor.optional() }).optional(),
    fontDisplay: z.string().max(40).optional().describe('Google Fonts family for headings, e.g. "Inter"'),
    fontBody: z.string().max(40).optional().describe('Google Fonts family for text'),
    wordmark: z.object({ text: z.string().max(60).optional(), case: z.enum(['lower', 'upper', 'as-is']).optional(), weight: z.number().min(100).max(900).optional(), letterSpacing: z.string().max(12).optional(),
      highlight: z.array(z.object({ from: z.number().int().min(0), to: z.number().int().min(1), color: hexColor.optional() })).max(6).optional(), svg: z.string().max(20000).optional() }).optional()
      .describe('How the brand writes its own name: case, weight, accent letters, or an SVG logotype. Used wherever the name appears; never re-cased.'),
  }).strict().optional().describe('The brand\'s own look. It always wins over the event theme; the event only adds its label. Ask the seller for their colours and fonts (or read them from their site) rather than guessing.');
  const positioningFields = {
    positioning: z.object({ is: z.string().max(200).optional(), isNot: z.array(z.string().max(60)).max(12).optional() }).optional().describe('What the brand is, and what it must never be called (e.g. isNot: ["a dating app"]).'),
    avoidWords: z.array(z.string().max(40)).max(30).optional().describe('Words that must never appear in copy (e.g. "swipe", "matches", "cheap").'),
    alwaysSay: z.array(z.string().max(60)).max(10).optional().describe('Preferred phrases or terms to use.'),
    noLocationMentions: z.boolean().optional().describe('Never add country or city mentions the seller did not ask for (default true).'),
  };
  const copyFields = {
    displayName: z.string().max(40).optional().describe('Short name used in copy, e.g. "Brightly Premium". Never pass long internal product phrases as headings.'),
    offerType: z.enum(['physical', 'subscription', 'course', 'service', 'digital']).optional().describe('How it is bought; decides the verbs (shop, start your plan, enrol, book, get). Inferred when missing.'),
  };
  // render_check: every page and kit is checked against Quint AI's own rules before it is shown.
  // When connected, issues are filed automatically (tool arguments and the failing snippet only).
  const runChecks = (tool, input) => {
    const r = checkOutput(input);
    if (cloud.hasKey() && input.args?.reportIssues !== false) cloud.countRun(tool, r.passed).catch(() => {});
    if (r.issues.length && cloud.hasKey() && input.args?.reportIssues !== false) {
      const args = Object.fromEntries(Object.entries(input.args ?? {}).filter(([k]) => !['html', 'images', 'products', 'posts'].includes(k)));
      cloud.reportIssues({ source: 'auto', tool, version: VERSION, issues: r.issues, args }).catch(() => {});
    }
    return { passed: r.passed, issues: r.issues, ...(r.passed ? {} : { fix: 'Fix the errors (usually by passing your own copy, displayName or brand settings) and run the tool again before publishing.' }) };
  };

  // A saved brand profile fills anything the caller did not pass (look, voice, names, links).
  const withProfile = async (a, keys, notes) => {
    if (!cloud.hasKey()) return a;
    const saved = (await cloud.brand().catch(() => null))?.profile;
    if (!saved) return a;
    const fill = Object.fromEntries(keys.filter((k) => a[k] === undefined && saved[k] !== undefined).map((k) => [k, saved[k]]));
    if (Object.keys(fill).length) notes.push(`Filled from your saved brand profile: ${Object.keys(fill).join(', ')}.`);
    return { ...fill, ...a };
  };
  // Local (stdio) servers can save the key that "connect" receives; the hosted server cannot.
  const cloud = createCloud({ persist: allowFileWrites, client: 'AI app' });
  server.server.oninitialized = () => { const c = server.server.getClientVersion?.(); if (c?.name) cloud.clientName?.(c.name); };

  async function maybeWrite(outputPath, content, allowed) {
    if (!outputPath) return null;
    if (!allowFileWrites) throw new Error('outputPath is only supported when the server runs locally (stdio). Copy the returned content instead.');
    const ext = extname(outputPath).toLowerCase();
    if (!allowed.includes(ext)) throw new Error(`outputPath must end with ${allowed.join(' or ')}`);
    const full = resolve(outputPath);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
    return full;
  }

  server.registerTool('event_calendar', {
    title: 'Holiday, shopping and events calendar',
    description: 'List holidays, shopping days, religious and cultural events and observances for any date range and region, with exact dates, days until each, when to start promoting, content angles and hashtags. Defaults to the next 90 days. Use this before planning any campaign.',
    inputSchema: {
      year: z.number().int().min(2024).max(2030).optional().describe('Season year; default current year'),
      from: date.optional().describe('Start date inclusive; default today'),
      to: date.optional().describe('End date inclusive; default 90 days from start'),
      regions: regionList.optional(),
      categories: z.array(z.enum(CATEGORIES)).optional(),
      minImpact: z.enum(['low', 'medium', 'high']).optional(),
      includePast: z.boolean().optional().describe('Include events that already ended; default false'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async (a) => {
    const places = a.regions ? normalizeRegions(a.regions) : null;
    let events = listEvents({ ...a, regions: places?.values });
    // With a place given, events celebrated there come first; worldwide events that are mainly another
    // market's (Diwali for Nigeria, Singles' Day outside Asia) are kept but marked lowRelevance.
    if (places?.values?.length) {
      events = events.map((e) => { const r = relevance(e, places.values); return { ...e, relevance: r.score, why: r.reasons, ...(r.score < 1.5 ? { lowRelevance: true } : {}) }; })
        .sort((x, y) => Number(Boolean(x.lowRelevance)) - Number(Boolean(y.lowRelevance)) || x.date.localeCompare(y.date));
    }
    if (places?.unknown.length) return json({ count: events.length, events, unknownPlaces: places.unknown, note: `Could not place: ${places.unknown.join(', ')}. Showing events for the rest (worldwide if none).` });
    return json({ count: events.length, events, note: 'Lunar-calendar dates (Diwali, Dhanteras, Hanukkah) are verified for 2026-2028. Hanukkah begins at sundown.' });
  }));

  server.registerTool('content_plan', {
    title: 'Build a content plan',
    description: 'Generate a day-by-day content calendar per platform for the coming weeks. Niche-aware (angles, hooks and shots fit the product), audience-aware (events ranked by relevance to the regions) and cadence-aware (email and WhatsApp capped to avoid unsubscribes). Each slot is tied to a campaign phase (tease, warm-up, early-access, launch, last-chance, thank-you) for the most important upcoming event, or an evergreen pillar on quiet days. Observances like Remembrance Day get no-sales guidance. Returns slots you then fill with captions and assets.',
    inputSchema: {
      brand: z.string().min(1),
      niche: z.string().min(1).describe('What they sell, in their words, e.g. "sneakers in Lagos", "online fitness coaching"'),
      product: z.string().optional(),
      platforms: platformList,
      regions: regionList.optional(),
      startDate: date.optional().describe('Default today'),
      endDate: date.optional().describe('Default 60 days from start'),
      postsPerWeek: z.number().int().min(1).max(7).optional().describe('Per platform; default 4'),
      postTimes: z.record(z.string(), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).optional().describe('Seller\'s own posting times per platform, 24-hour, e.g. { "instagram": "18:00" }. Every slot has a suggested time otherwise'),
      focusEvents: z.array(z.string()).optional().describe('Events to campaign around, ids or names ("black friday", "eid", "valentines")'),
      offer: z.string().optional().describe('Written any way: "30% off", "N5k off", "BOGO", "free delivery"'),
      sellsProducts: z.boolean().optional().describe('false for creators who only publish content; default true'),
      featured: z.array(z.string()).max(5).optional().describe('Products to push, best seller first. When connected to Quint AI Cloud this is filled from real WhatsApp order taps.'),
      useStats: z.boolean().optional().describe('Use sales page stats to pick featured products (default true when connected)'),
      format: z.enum(['json', 'markdown']).optional().describe('Default json'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async (a) => {
    let signals;
    if (!a.featured?.length && a.useStats !== false && cloud.hasKey()) {
      const st = await cloud.stats(14).catch(() => null);
      const items = {};
      for (const p of st?.pages ?? []) for (const [k, n] of Object.entries(p.byItem ?? {})) items[k] = (items[k] ?? 0) + n;
      const top = Object.entries(items).sort((x, y) => y[1] - x[1]).slice(0, 3);
      if (top.length) {
        a = { ...a, featured: top.map(([k]) => k) };
        signals = { source: 'Quint AI page stats, last 14 days', topProducts: top.map(([name, taps]) => ({ name, orderTaps: taps })), tip: `${top[0][0]} gets the most order taps, so selling posts feature it most often.` };
      }
    }
    const plan = { ...buildPlan(a), ...(signals ? { salesSignals: signals } : {}) };
    return a.format === 'markdown' ? { content: [{ type: 'text', text: toMarkdown(plan) }] } : json(plan);
  }));

  server.registerTool('platform_specs', {
    title: 'Platform content specs',
    description: 'Image/video sizes, aspect ratios, length limits, caption limits, safe zones, posting cadence and tips for Instagram, TikTok, YouTube, LinkedIn, X, Facebook, Pinterest, Threads, WhatsApp and email.',
    inputSchema: { platforms: platformList.optional().describe('Default: all') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async (a) => json(getSpecs(a.platforms ? normalizePlatforms(a.platforms).values : undefined))));

  server.registerTool('asset_brief', {
    title: 'Content asset brief',
    description: 'Create a production brief for one post, image, carousel, story, video or email: exact specs, hook formulas, structure, image-generation prompt with the right size per tool (Midjourney, GPT Image, Imagen, Flux), video beat sheet and shot list, and a compliance checklist (ad disclosure, pricing, giveaways, AI labels, music).',
    inputSchema: {
      platform: z.string().describe('Any spelling: instagram/ig, tiktok, whatsapp, email...'),
      assetType: z.enum(ASSET_TYPES),
      niche: z.string().optional().describe('What they sell, in their words; tailors hooks, shots and compliance'),
      format: z.string().optional().describe('Platform format id from platform_specs, e.g. "reel", "carousel"'),
      brand: z.string().min(1),
      product: z.string().optional(),
      offer: z.string().optional(),
      eventId: z.string().optional().describe('Event id or name, e.g. "black-friday", "valentines", "eid"'),
      phase: z.enum(['tease', 'warm-up', 'early-access', 'launch', 'last-chance', 'thank-you']).optional(),
      tone: z.string().optional(),
      videoSeconds: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(),
      sponsored: z.boolean().optional().describe('Paid partnership, gifted or affiliate'),
      giveaway: z.boolean().optional(),
      aiGenerated: z.boolean().optional().describe('Asset will use AI-generated imagery/video'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async (a) => json(buildBrief({ ...a, eventId: a.eventId ? eventRef(a.eventId) : undefined }))));

  server.registerTool('landing_page', {
    title: 'Sales landing page',
    description: `Write the copy yourself and pass it (headline, subheadline, features, ctaText, statement, displayName); Quint AI's own copy is only a plain fallback and the result lists which parts used it (fallbacks). Pass the brand's look with brandStyle (mode, palette, fontDisplay, fontBody, wordmark) and its rules with positioning and avoidWords, or save them once with brand_profile. Every page is checked (checks) before you show it. Generate a premium, ready-to-deploy sales page (one HTML file) built around what the user sells. Works from minimal input (brand + product): the copy is written from the facts given and never invents reviews, guarantees or prices.
An art director picks the page structure from the niche: cinematic full-bleed scenes for cars, gadgets and fitness; a split showcase (sticky photos beside scrolling story) for fashion, home, food and services; a product stage (product spins and zooms with scroll, stickers pop) for shoes, beauty, jewellery and kids; editorial for courses, software and digital products. Motion is scroll-linked (pinned scenes, scrubbed zoom, horizontal galleries, text that fills as you scroll), not timed fades. Fonts, navigation, buttons and countdown style vary per brand (re-roll with variant).
Media: pass the seller's own photos (images, productImage), a turntable video (videoUrl, scrubbed by scroll) or a 3D model (modelUrl, .glb, rotates with scroll and can be dragged). With no media, free mood photos are fetched automatically (autoImages).
A holiday theme (${Object.keys(THEMES).join(', ')}) adds its palette and name; with layout "signature" and no product, the art-directed holiday scenes are used instead.
Includes an honest countdown, sticky mobile CTA, SEO/Open Graph tags, Product/Offer structured data and photo credits. Deploy to Netlify Drop, Vercel, GitHub Pages or Cloudflare Pages.`,
    inputSchema: {
      brand: z.string().min(1),
      product: z.string().optional().describe('What is on sale, in plain words: "sneakers", "ankara dresses", "used cars", "online course"'),
      niche: z.string().optional().describe('Optional extra context about the business, in the user\'s words'),
      theme: z.enum(Object.keys(THEMES)).optional().describe('Holiday accent'),
      eventName: z.string().optional().describe('Event label when no theme fits, e.g. "Eid", "Mother\'s Day"'),
      layout: z.enum(LAYOUTS).optional().describe('Default: director when the product is known; "signature" forces the holiday scene'),
      archetype: z.enum(['cinematic', 'split', 'stage', 'editorial']).optional().describe('Override the art director'),
      variant: z.number().int().min(0).max(99).optional().describe('Re-roll fonts, nav, buttons and countdown style'),
      images: z.array(z.union([z.string(), z.object({ url: z.string(), alt: z.string().optional(), attribution: z.string().optional() })])).max(8).optional().describe('Photos, best first. Use the seller\'s own product photos when possible'),
      productImage: z.string().optional().describe('Product photo, ideally a cut-out PNG on transparent background'),
      products: z.array(z.object({ name: z.string(), price: z.string().optional(), originalPrice: z.string().optional(), image: z.string().optional(), note: z.string().optional(), url: z.string().optional() })).max(12).optional().describe('Items on sale; shown as a product grid. With a WhatsApp ctaUrl each card opens a prefilled order chat'),
      videoUrl: z.string().optional().describe('Short turntable/walkaround video (mp4); scroll scrubs through it'),
      modelUrl: z.string().optional().describe('3D model (.glb); rotates with scroll'),
      autoImages: z.boolean().optional().describe('Fetch free mood photos when no media is given (default true)'),
      offer: z.string().optional().describe('e.g. "40% off everything"'),
      discountPercent: z.number().min(1).max(99).optional(),
      price: z.string().optional(),
      originalPrice: z.string().optional().describe('Only a price you actually charged recently'),
      currency: z.string().length(3).optional(),
      ctaText: z.string().optional(),
      ctaUrl: z.string().optional().describe('Checkout, WhatsApp (https://wa.me/...) or product link. If omitted the button links to "#"'),
      deadline: z.string().optional().describe('ISO 8601 with offset, e.g. 2026-11-30T23:59:00-05:00'),
      timeZone: z.string().optional().describe('IANA zone for the printed deadline, e.g. Africa/Lagos'),
      headline: z.string().optional(),
      subheadline: z.string().optional(),
      imageUrl: z.string().optional(),
      imageAlt: z.string().optional(),
      features: z.array(z.object({ title: z.string(), text: z.string() })).max(6).optional(),
      testimonials: z.array(z.object({ quote: z.string(), name: z.string(), detail: z.string().optional() })).max(3).optional().describe('Real customer quotes only, with permission'),
      faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
      terms: z.string().optional(),
      brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      brandStyle, ...copyFields, ...positioningFields,
      statement: z.string().max(160).optional().describe('One sentence for the scroll statement section; omitted when not given'),
      design: z.enum(['auto', 'story', 'classic']).optional().describe('"story": art-directed signature sections composed for this brand (hero, statement with a drawn thread, illustrated moments, promise band, journey, offer cards, giant wordmark footer). Chosen automatically when you pass moments, promise or steps.'),
      heroImage: z.string().optional().describe('Hero illustration or photo (PNG/SVG cut-outs are laid out frameless)'),
      moments: z.array(z.object({ title: z.string().max(60), text: z.string().max(200).optional(), image: z.string().optional(), alt: z.string().max(120).optional() })).max(3).optional().describe('Up to 3 illustrated moments (e.g. from illustrate)'),
      momentsTitle: z.string().max(60).optional(),
      promise: z.string().max(160).optional().describe('The brand promise for the contrast band'),
      steps: z.array(z.object({ title: z.string().max(60), text: z.string().max(200).optional() })).max(5).optional().describe('How it works, as a journey that fills as you scroll'),
      stepsTitle: z.string().max(60).optional(),
      galleryTitle: z.string().max(60).optional(), gridTitle: z.string().max(60).optional(),
      voice: z.string().max(300).optional(),
      pageUrl: z.string().optional(),
      effects: z.boolean().optional().describe('false turns off particles and 3D motion'),
      outputPath: z.string().optional().describe('Local mode only: write the HTML here (.html)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    const notes = [];
    a = await withProfile(a, ['brandStyle', 'brandColor', 'displayName', 'offerType', 'ctaUrl', 'voice', 'positioning', 'avoidWords'], notes);
    const hasMedia = a.images?.length || a.productImage || a.videoUrl || a.modelUrl || a.imageUrl;
    if (!hasMedia && a.autoImages !== false && a.layout !== 'signature') {
      const nicheId = classifyNiche(`${a.niche ?? ''} ${a.product ?? ''}`).id;
      const query = MOOD_QUERIES[nicheId]?.[0] ?? `${a.product ?? 'shopping'} lifestyle`;
      const found = await Promise.race([findImages(query, { orientation: 'landscape', count: 4 }).catch(() => null), new Promise((r) => setTimeout(() => r(null), 8000))]);
      if (found?.images.length) {
        a = { ...a, images: found.images.map((im) => ({ url: im.url, alt: im.alt, attribution: im.attribution })) };
        notes.push(`Added ${found.images.length} free mood photos for "${query}" (${found.providersTried.join(', ')}). Check them before publishing; replace with your own product photos for the best result.`);
        if (!found.providersTried.some((p) => p === 'pexels' || p === 'unsplash')) notes.push('For studio-quality photos set PEXELS_API_KEY or UNSPLASH_ACCESS_KEY (both free).');
      } else notes.push('No photos found in time; the page uses typography. Add images, productImage, videoUrl or modelUrl for a richer page.');
    }
    const html = buildLanding(a);
    const fallbacks = ['headline', 'subheadline', 'features', 'ctaText', 'displayName'].filter((k) => !a[k] || (Array.isArray(a[k]) && !a[k].length));
    const summary = { ...describeLanding(a), ...(fallbacks.length ? { fallbacks, copyNote: `Plain fallback copy was used for: ${fallbacks.join(', ')}. Write these in the brand's voice and call again for a page worth publishing.` } : {}), checks: runChecks('landing_page', { kind: 'page', html, args: a }) };
    if (!a.ctaUrl) notes.push('The button links to "#". Add ctaUrl (checkout, product page or https://wa.me/<number>) before publishing.');
    if (!a.deadline) notes.push('No deadline given, so there is no countdown.');
    const written = await maybeWrite(a.outputPath, html, ['.html', '.htm']);
    const head = `${JSON.stringify({ ...summary, notes }, null, 2)}\n`;
    return { content: [{ type: 'text', text: written ? `Landing page written to ${written} (${html.length} bytes).\n${head}` : `${head}\n${html}` }] };
  }));

  server.registerTool('export_plan', {
    title: 'Export content plan',
    description: 'Export a content plan from content_plan as CSV (Google Sheets, Notion, Airtable), ICS (Google/Apple/Outlook calendar) or Markdown. Pass the same arguments you used for content_plan.',
    inputSchema: {
      brand: z.string().min(1),
      niche: z.string().min(1),
      product: z.string().optional(),
      platforms: platformList,
      regions: regionList.optional(),
      startDate: date.optional(),
      endDate: date.optional(),
      postsPerWeek: z.number().int().min(1).max(7).optional(),
      focusEvents: z.array(z.string()).optional(),
      offer: z.string().optional(),
      sellsProducts: z.boolean().optional(),
      as: z.enum(['csv', 'ics', 'markdown']),
      outputPath: z.string().optional().describe('Local mode only: write the file here'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, wrap(async (a) => {
    const plan = buildPlan(a);
    const out = a.as === 'csv' ? toCSV(plan.slots) : a.as === 'ics' ? toICS(plan.slots, `${a.brand} content plan`) : toMarkdown(plan);
    const written = await maybeWrite(a.outputPath, out, { csv: ['.csv'], ics: ['.ics'], markdown: ['.md'] }[a.as]);
    return { content: [{ type: 'text', text: written ? `Wrote ${plan.slots.length} slots to ${written}.` : out }] };
  }));

  server.registerTool('start_campaign', {
    title: 'Start here: understand the request',
    description: 'Call this FIRST with whatever the user wrote, even if vague or misspelled ("i sell sneakers in lagos, need bf content for ig"). Returns what was understood (niche, product, platforms, regions, currency, offer, deadline), the assumptions made, at most 3 blocking questions, the events that matter for this audience ranked by relevance, what to post right now, compliance notes for the niche, the landing page direction, and prefilled arguments for the next tool calls. Questions are never blocking: ask them in one short message and continue with the defaults shown.',
    inputSchema: {
      description: z.string().min(1).describe("The user's request in their own words"),
      brand: z.string().optional(),
      product: z.string().optional(),
      platforms: platformList.optional(),
      regions: regionList.optional(),
      offer: z.string().optional(),
      deadline: z.string().optional().describe('Any form: "Nov 30", "30/11", "black friday"'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
      live: z.boolean().optional().describe('Include official public holidays from live data (default true)'),
  }, wrap(async (a) => {
    const r = startCampaign(a);
    if (a.live !== false && r.understood.countries.length) {
      // Live official holidays for the named countries; never block on a slow source.
      const live = await Promise.race([
        upcomingHolidays(r.understood.countries, { days: 90 }),
        new Promise((res) => setTimeout(() => res({ holidays: [], errors: ['live holidays timed out'] }), 7000)),
      ]);
      r.publicHolidays = live.holidays.map((h) => ({ date: h.date, name: h.name, country: h.countryName, daysUntil: h.daysUntil }));
      if (live.errors.length) r.liveDataNotes = live.errors;
    }
    return json(r);
  }));

  server.registerTool('whats_on', {
    title: "What's happening now",
    description: 'Live data for content ideas: today\'s top searches per country (Google Trends), official public holidays coming up (100+ countries), and what the world is reading (Wikipedia). Flags sensitive topics that brands must not use for promotion and marks trends that fit the niche. Use it to make posts timely, plan around public holidays, and spot trends worth a quick story or reel.',
    inputSchema: {
      places: regionList.describe('Countries, cities or continents, e.g. "Nigeria, UK", "West Africa", "Dubai"'),
      niche: z.string().optional().describe('What they sell, to mark trends that fit'),
      days: z.number().int().min(7).max(180).optional().describe('Holiday look-ahead in days (default 60)'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async (a) => {
    const { countries, unknown } = normalizeRegions(a.places);
    const n = a.niche ? NICHES[classifyNiche(a.niche).id] : null;
    const r = await whatsOn({ countries, days: a.days, keywords: n ? [...n.keywords, ...a.niche.toLowerCase().split(/\W+/).filter((w) => w.length > 3)] : [] });
    return json({ countries, ...(unknown.length ? { unknownPlaces: unknown } : {}), ...r });
  }));

  server.registerTool('find_images', {
    title: 'Find free, licensed photos',
    description: "Search commercially usable photos for pages and posts. Uses Pexels or Unsplash when PEXELS_API_KEY or UNSPLASH_ACCESS_KEY is set (best quality), otherwise Wikimedia Commons and Openverse. Each result has its licence, author and an attribution line. Photos that likely show other brands' logos are removed by default. Use stock photos for mood and backgrounds; the product itself should be the seller's own photo.",
    inputSchema: {
      query: z.string().min(2).describe('Describe the scene, e.g. "sneakers on wet street at night"'),
      orientation: z.enum(['landscape', 'portrait', 'squarish']).optional(),
      count: z.number().int().min(1).max(20).optional(),
      allowBrands: z.boolean().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async (a) => json(await findImages(a.query, a))));

  // ---- Quint AI Cloud: publish, measure, own domain, billing ----
  server.registerTool('publish_page', {
    title: 'Publish a page online',
    description: 'Put a sales page online and get a shareable link, e.g. https://quint-korakicks.erasstack.com/black-friday. Pass the HTML from landing_page, a local file path (local mode), or "page" with landing_page arguments to build and publish in one step. Free plan: 1 site, 3 live pages, small badge. Pro adds the user\'s own domain and removes the badge. If not connected yet, call cloud_account with action "connect" first (free, one browser approval).',
    inputSchema: {
      brand: z.string().min(1).describe('Brand name; becomes the address quint-<brand>.erasstack.com'),
      path: z.string().optional().describe('Page path, e.g. "black-friday"; empty for the home page'),
      role: z.enum(['home', 'campaign', 'product', 'legal', 'review']).optional().describe('home (site root, links live campaigns automatically), campaign (ends cleanly after endsAt), product, legal, or review (private, not indexed, does not use a page slot)'),
      endsAt: z.string().optional().describe('For campaigns: when the offer ends (ISO with time zone). After it, the page says the offer has ended, then redirects home.'),
      html: z.string().optional(),
      file: z.string().optional().describe('Local mode: path to an .html file'),
      page: z.record(z.string(), z.any()).optional().describe('landing_page arguments to build and publish in one call'),
      title: z.string().optional(),
      force: z.boolean().optional().describe('Publish even if Quint AI\'s checks find errors (not recommended).'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    let pageHtml = a.html;
    if (!pageHtml && a.file) {
      if (!allowFileWrites) throw new Error('file is only supported when the server runs locally. Pass html instead.');
      pageHtml = await readFile(a.file, 'utf8');
    }
    if (!pageHtml && a.page) pageHtml = buildLanding(await withProfile({ brand: a.brand, ...a.page }, ['brandStyle', 'brandColor', 'displayName', 'offerType', 'ctaUrl', 'voice', 'positioning', 'avoidWords'], []));
    if (!pageHtml) throw new Error('Send html, file or page.');
    const checks = runChecks('publish_page', { kind: 'page', html: pageHtml, args: { brand: a.brand, ...(a.page ?? {}) } });
    if (!checks.passed && !a.force) return json({ published: false, checks, next: 'The page failed Quint AI\'s checks, so it was not published. Fix the errors, or pass force: true to publish anyway.' });
    const r = await cloud.publish({ brand: a.brand, path: a.path, html: pageHtml, title: a.title, role: a.role, endsAt: a.endsAt ?? a.page?.deadline });
    return json({ ...r, checks, share: `Share this link on WhatsApp, Instagram bio and Status: ${r.url}` });
  }));

  server.registerTool('page_stats', {
    title: 'Page results',
    description: 'Views, WhatsApp order clicks and button clicks for published pages, broken down per product (e.g. "Runner One: 48 WhatsApp clicks"). Use it to tell the user what is selling and what to push next.',
    inputSchema: { days: z.number().int().min(1).max(365).optional().describe('Look-back window, default 30 (free plan keeps 7)') },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async (a) => json(await cloud.stats(a.days ?? 30))));

  server.registerTool('connect_domain', {
    title: 'Connect your own domain',
    description: 'Pro: serve published pages on the user\'s own domain (e.g. sale.korakicks.com) with automatic HTTPS. Returns the one DNS record to add. Call again with check: true to see if it is live.',
    inputSchema: { hostname: z.string().min(4), check: z.boolean().optional(), site: z.string().optional().describe('Which brand site, if more than one') },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => json(a.check ? await cloud.domainStatus(a.hostname) : await cloud.connectDomain(a.hostname, a.site))));

  server.registerTool('cloud_account', {
    title: 'Quint AI account and plans',
    description: 'Quint AI Cloud account. "connect" links this AI app to the user account: it returns a link and code the user approves in their browser (new users get a free account); call it again to finish. "status" shows plan, limits and sites. "pages" lists published pages. "dashboard" returns the web dashboard link (views, WhatsApp orders per product, plan). "upgrade" returns a secure Flutterwave card checkout link for Pro or Business, priced in Naira for Nigeria and US Dollars elsewhere. "signup" (fallback) emails a sign-in link; the user then connects or creates a key from their profile. Never ask for passwords or card details in chat; always send the link.',
    inputSchema: {
      action: z.enum(['connect', 'status', 'pages', 'dashboard', 'upgrade', 'signup']),
      email: z.string().optional(),
      plan: z.enum(['pro', 'business']).optional(),
      currency: z.enum(['NGN', 'USD']).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    if (a.action === 'connect') return json(await cloud.connect());
    if (a.action === 'dashboard') return json({ url: cloud.dashboardUrl(), note: 'The user signs in with their email; no password.' });
    if (a.action === 'signup') { if (!a.email) throw new Error('Send the user\'s email.'); return json(await cloud.signup(a.email)); }
    if (a.action === 'status') return json(await cloud.me());
    if (a.action === 'pages') return json(await cloud.pages());
    const r = await cloud.checkout(a.plan ?? 'pro', a.currency);
    return json({ ...r, note: 'Send this link to the user. Payment happens on Flutterwave\'s secure page; the plan activates as soon as the payment is verified.' });
  }));

  // Local photo studio: runs scripts/studio_photo.py on the user's machine (free, private, no upload).
  const studioScript = fileURLToPath(new URL('../scripts/studio_photo.py', import.meta.url));
  const runPython = (args) => new Promise((resolveP, reject) => {
    const tryCmd = (cmds) => {
      if (!cmds.length) return reject(new Error('Python 3 was not found. Install it from python.org, then: pip install pillow "rembg[cpu]"'));
      const [cmd, ...pre] = cmds[0];
      const ps = spawn(cmd, [...pre, ...args], { windowsHide: true });
      let out = '', err = '';
      ps.stdout.on('data', (d) => { out += d; });
      ps.stderr.on('data', (d) => { err += d; });
      ps.on('error', () => tryCmd(cmds.slice(1)));
      ps.on('close', (code) => (code === 0 ? resolveP(out) : /No module named 'PIL'/.test(err) ? reject(new Error('Install Pillow first: pip install pillow "rembg[cpu]"')) : reject(new Error(err.split('\n').filter(Boolean).pop() || `studio_photo exited ${code}`))));
    };
    tryCmd(process.platform === 'win32' ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']]);
  });

  server.registerTool('studio_photo', {
    title: 'Studio product photo',
    description: 'Turn a seller\'s phone photo into a clean product shot on their own computer (free, nothing uploaded): fixes colour and sharpness, removes the background (when rembg is installed) and places the product on a studio backdrop in the brand colour or on a full scene photo, with a soft shadow. Use the result as products[].image in content_kit or landing_page. Local only.',
    inputSchema: {
      input: z.string().describe('Path to the photo (or an https URL to download)'),
      outputPath: z.string().optional().describe('Where to save, .jpg or .png (default: next to the input, "-studio.jpg")'),
      background: z.string().optional().describe('Backdrop colour, e.g. "#111111" (default warm light grey)'),
      scene: z.string().optional().describe('Path to a photo to use as the full background instead of a colour'),
      size: z.number().int().min(600).max(3000).optional(),
      keepBackground: z.boolean().optional().describe('Only enhance; do not remove the background'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, wrap(async (a) => {
    if (!allowFileWrites) throw new Error('studio_photo runs on your own computer. Use the local Quint AI server (npx quint-ai-mcp), or ask the assistant to clean up the photo with its own image tools.');
    let input = a.input;
    if (/^https:\/\//.test(input)) {
      const r = await fetch(input, { signal: AbortSignal.timeout(20000) });
      if (!r.ok || !/^image\//.test(r.headers.get('content-type') ?? '')) throw new Error('That link is not an image.');
      input = resolve(`quint-ai-photo-${Date.now()}.jpg`);
      await writeFile(input, Buffer.from(await r.arrayBuffer()));
    }
    if (!existsSync(input)) throw new Error(`File not found: ${input}`);
    const out = a.outputPath ?? input.replace(/(\.[a-z0-9]+)?$/i, '-studio.jpg');
    const args = [studioScript, input, out, '--size', String(a.size ?? 1600)];
    if (a.background) args.push('--bg', a.background);
    if (a.scene) args.push('--scene', a.scene);
    if (a.keepBackground) args.push('--keep-bg');
    const line = (await runPython(args)).trim().split('\n').pop();
    return json({ ...JSON.parse(line), next: 'Pass this file as products[].image to content_kit or landing_page.' });
  }));

  server.registerTool('report_issue', {
    title: 'Report a problem with Quint AI output',
    description: 'When the seller says something Quint AI made is wrong ("off-brand", "wrong image", "copy does not fit", "looks generic", "not us"), call this with their words and what it was about. It goes to the Quint AI team with the context, so the seller never has to write a report. Needs connect.',
    inputSchema: {
      what: z.string().min(3).max(500).describe('What the seller said, in their words'),
      tool: z.string().max(40).optional().describe('Which tool made it, e.g. content_kit, landing_page'),
      chip: z.enum(['off-brand', 'wrong-image', 'copy-does-not-fit', 'looks-generic', 'wrong-brand-name', 'wrong-price', 'other']).optional(),
      url: z.string().max(300).optional().describe('The kit or page link, if any'),
      args: z.record(z.string(), z.any()).optional().describe('The tool arguments that produced it (no customer data)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    const r = await cloud.reportIssues({ source: 'user', tool: a.tool ?? 'unknown', version: VERSION, issues: [{ rule: `user.${a.chip ?? 'other'}`, severity: 'error', message: a.what, sample: a.url }], args: a.args ?? {} });
    return json({ ok: true, ...r, note: 'Thanks. The Quint AI team gets this with the context. Meanwhile, tell me what to change and I will fix it now.' });
  }));

  server.registerTool('brand_profile', {
    title: 'Saved brand profile',
    description: 'Save or read the seller\'s brand profile in Quint AI Cloud (needs connect): voice, products with real prices, order link, colours and logo. Saved details fill in content_kit and sales pages automatically, so the seller does not repeat them. Logo and colours on graphics are a Pro feature. Only save prices the seller gave you.',
    inputSchema: {
      action: z.enum(['get', 'save']),
      profile: z.object({
        brand: z.string().optional(), niche: z.string().optional(), voice: z.string().max(300).optional().describe('How the brand talks, e.g. "playful, Lagos slang, short sentences"'),
        ctaUrl: z.string().optional(), logoUrl: z.string().optional(), brandColor: z.string().optional(),
        brandStyle, ...copyFields, ...positioningFields,
        illustration: z.object({ style: z.enum(['flat-editorial', 'soft-line', 'textured-gouache']).optional(), audience: z.object({ region: z.string().max(60).optional(), ageRange: z.string().max(20).optional() }).optional(), avoid: z.array(z.string().max(40)).max(12).optional(), reference: z.string().optional(), scenes: z.array(z.object({ scene: z.string(), url: z.string() })).max(40).optional() }).optional().describe('How this brand\'s illustrations look (style, audience, avoid) and the registered scenes; filled by illustrate.'),
        products: z.array(z.object({ name: z.string(), price: z.string().optional(), originalPrice: z.string().optional(), note: z.string().optional(), image: z.string().optional() })).max(20).optional(),
      }).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => json(a.action === 'save' ? await cloud.saveBrand(a.profile ?? {}) : await cloud.brand())));

  const kitHandler = async (a) => {
    const notes = [];
    let plan = 'free';
    if (cloud.hasKey()) {
      plan = (await cloud.me().catch(() => null))?.plan ?? 'free';
      // Saved brand profile fills anything not given in this request.
      const saved = (await cloud.brand().catch(() => null))?.profile;
      if (saved) {
        const fill = Object.fromEntries(['product', 'niche', 'ctaUrl', 'logoUrl', 'brandColor', 'products', 'brandStyle', 'displayName', 'offerType', 'voice', 'positioning', 'avoidWords', 'alwaysSay', 'noLocationMentions'].filter((k) => a[k] === undefined && saved[k] !== undefined).map((k) => [k, saved[k]]));
        if (Object.keys(fill).length) { a = { ...fill, ...a }; notes.push(`Filled from your saved brand profile: ${Object.keys(fill).join(', ')}.`); }
      }
    }
    const paid = plan !== 'free';
    if (!paid && a.logoUrl) { notes.push('Your logo on graphics is part of Pro; upgrade with cloud_account action "upgrade".'); a = { ...a, logoUrl: undefined }; }
    // Mood photos must actually show this kind of product (and no other brand). Products themselves are
    // only shown with the seller's photos; kit graphics wait for an upload otherwise.
    // Photos are decided in the chat, before anything is made: if a product has no photo and the
    // seller has not chosen what to do, ask (own photos, representative, generated, or none).
    const missing = (a.products ?? []).filter((p) => !p.image);
    if (missing.length && !a.productPhotos) {
      const names = missing.slice(0, 4).map((p) => p.name).join(', ') + (missing.length > 4 ? ', ...' : '');
      return json({
        needsAnswer: true,
        askUser: [{ field: 'productPhotos', question: `I need a photo for ${names}. Send your photos (phone photos are fine, I can clean them up), or should I use representative photos (tagged as such on the post), create images, or make these posts without photos?`, why: 'Buyers trust real photos; anything else is clearly labelled.' }],
        howToAsk: 'Ask this in one short message. Then call content_kit again with the same details plus productPhotos ("own" with products[].image set, "representative", or "none"). If the seller wants created images and you can generate images, generate them and pass the URLs as products[].image with productPhotos "own". If they send phone photos and studio_photo is available, run it first for a clean product shot.',
      });
    }
    if (a.productPhotos === 'representative' && missing.length) {
      const nicheId = classifyNiche(`${a.niche ?? ''} ${a.product ?? ''}`).id;
      const search = cloud.hasKey() && !process.env.PEXELS_API_KEY && !process.env.UNSPLASH_ACCESS_KEY ? (q, opt) => cloud.images(q, opt) : null;
      const used = new Set();
      const filled = await Promise.all(a.products.map(async (p) => {
        if (p.image) return p;
        const attributes = (p.name.match(/\b(white|black|red|blue|green|pink|brown|grey|gray|gold|silver|leather|suede|denim|silk|linen|low|high|slide|sandal|boot|runner|running)\b/gi) ?? []).join(' ');
        const r = await Promise.race([matchingImages({ nicheId, product: a.product ?? p.name, attributes, orientation: 'squarish', count: 4, search, productShot: true, mustMatch: typeWords(p.name) }).catch(() => null), new Promise((res) => setTimeout(() => res(null), 9000))]);
        const pick = r?.images.find((im) => !used.has(im.url));
        if (!pick) return p;
        used.add(pick.url);
        return { ...p, image: pick.url, representative: true, credit: pick.attribution };
      }));
      const reps = filled.filter((p) => p.representative);
      if (reps.length) notes.push(`${reps.length} product post(s) use a representative photo (tagged on the graphic) because no photo was given: ${reps.map((p) => p.name).join(', ')}. Ask for the seller's own photos to replace them; buyers trust real photos most.`);
      a = { ...a, products: filled };
    }
    if (!a.images?.length && a.autoImages !== false) {
      const nicheId = classifyNiche(`${a.niche ?? ''} ${a.product ?? ''}`).id;
      const attributes = (a.products ?? []).map((p) => p.name).join(' ').match(/\b(white|black|red|blue|green|pink|brown|gold|silver|leather|denim|silk|linen)\b/i)?.[1] ?? '';
      const search = cloud.hasKey() && !process.env.PEXELS_API_KEY && !process.env.UNSPLASH_ACCESS_KEY ? (q, opt) => cloud.images(q, opt) : null;
      const found = await Promise.race([matchingImages({ nicheId, product: a.product ?? '', attributes, orientation: 'squarish', count: 3, search }).catch(() => null), new Promise((r) => setTimeout(() => r(null), 9000))]);
      if (found?.images.length) {
        a = { ...a, images: found.images.map((im) => ({ url: im.url, alt: im.alt })) };
        notes.push(`Offer and story posts use ${found.images.length} licensed photos that match "${found.query}" (checked for the product type, no other brands). Credits: ${found.images.map((im) => im.attribution).filter(Boolean).join('; ')}.`);
      } else notes.push(`No photo clearly matching "${a.product ?? 'the product'}" was found, so offer posts use bold type instead of an unrelated picture.`);
    }
    if (!a.price && !a.products?.length) notes.push('No prices given, so graphics show the offer without prices.');
    const hosted = cloud.hasKey();
    // Local photo files (e.g. from studio_photo): embedded in a local kit, uploaded into a hosted kit.
    const localFiles = [];
    if (allowFileWrites) {
      a = { ...a, products: await Promise.all((a.products ?? []).map(async (p, i) => {
        if (!p.image || /^(https?:|data:)/.test(p.image) || !existsSync(p.image)) return p;
        const buf = await readFile(p.image);
        const type = /\.png$/i.test(p.image) ? 'image/png' : /\.webp$/i.test(p.image) ? 'image/webp' : 'image/jpeg';
        localFiles.push({ key: String(i), buf, type });
        return { ...p, image: hosted ? undefined : `data:${type};base64,${buf.toString('base64')}`, representative: false };
      })) };
    }
    const kit = buildKit({ ...a, watermark: !paid, proxy: hosted ? (url, i) => (/^data:/.test(url) ? url : `/__quint/img/__KIT__/${i}`) : undefined });
    const { askUser, assumed } = questionsFor('kit', a);
    if (a.discountPercent || /\d\s*%|off/i.test(a.offer ?? '') || a.originalPrice) notes.push('Before you share: make sure your checkout or app actually charges the advertised sale price. Advertising a price you do not charge is a consumer-law risk (for example under Nigeria\'s FCCPA).');
    const summary = { posts: kit.posts, notes, ...(askUser.length ? { askUser, howToAsk: ASK_RULE } : {}), assumed, checks: runChecks('content_kit', { kind: 'kit', html: kit.html, args: { ...a, offerType: a.offerType }, posts: kit.posts, contentOnly: kit.contentOnly }) };
    if (hosted) {
      const keep = Object.fromEntries(Object.entries(a).filter(([k, v]) => !['outputPath', 'kitId'].includes(k) && v !== undefined));
      const body = { brand: a.brand, html: kit.html, images: kit.images.filter((u) => !/^data:/.test(u)), title: `${a.brand} content kit`, ...(a.deadline ? { deadline: a.deadline } : {}), args: keep };
      const r = a.kitId ? await cloud.updateKit(a.kitId, body) : await cloud.kit(body);
      for (const f of localFiles) {
        const ok = await cloud.kitPhoto(r.id, f.key, f.buf, f.type).then(() => true, () => false);
        if (!ok) notes.push(`Could not upload the photo for product ${Number(f.key) + 1}. Try again with a JPEG or PNG under 4 MB.`);
      }
      return json({ url: r.url, kitId: r.id, ...(a.kitId ? { updated: 'Same link, updated in place.' } : {}), expiresAt: r.expiresAt, watermark: r.watermark, ...summary, share: `Open ${r.url} on your phone and tap Share on each post, or download the images.`, ...(r.note ? { planNote: r.note } : {}) });
    }
    if (!allowFileWrites) throw new Error(`Connect first to get a kit link: ${cloud.dashboardUrl()} (or call cloud_account action "connect" when running locally).`);
    const file = await maybeWrite(a.outputPath ?? `${a.brand.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-content-kit.html`, kit.html, ['.html', '.htm']);
    return json({ file, ...summary, next: 'Open the file in a browser to review, download and share. Call cloud_account action "connect" to get a link you can open on your phone.' });
  };

  server.registerTool('content_kit', {
    title: 'Ready-to-post content kit',
    description: `Make finished social graphics with captions for a sale or launch: offer post (4:5), product spotlights (1:1), a carousel, Story/WhatsApp Status (9:16), a last-call story and an X/LinkedIn card (16:9). Returns a review page where the seller edits captions, then taps Share (phone share sheet: Instagram, TikTok, WhatsApp with the image attached), uses share links, copies captions or downloads PNGs. Nothing is posted automatically.
Connected to Quint AI Cloud: the kit is hosted at a link (Free: 7 days with a small mark; Pro: 90 days, no mark, own logo and colours). Not connected (local): an HTML file is written instead.
Images: the seller's own photos are best (products[].image or images). If you can generate images yourself, generate them and pass their https URLs. Otherwise free licensed photos are found automatically (autoImages). Never invent prices or deadlines; leave them out if unknown.`,
    inputSchema: {
      brand: z.string().min(1),
      product: z.string().optional().describe('What is on sale, e.g. "sneakers"'),
      niche: z.string().optional(),
      theme: z.string().optional().describe(`Event look: ${Object.keys(THEMES).join(', ')}`),
      offer: z.string().optional().describe('e.g. "30% off"'),
      discountPercent: z.number().min(1).max(95).optional(),
      price: z.string().optional(), originalPrice: z.string().optional(),
      deadline: z.string().optional().describe('ISO date-time the offer ends'), timeZone: z.string().optional(),
      ctaUrl: z.string().optional().describe('Checkout, product page or https://wa.me/<number>'),
      pageUrl: z.string().optional().describe('The live sales page link from publish_page, used in captions and share links'),
      products: z.array(z.object({ name: z.string(), price: z.string().optional(), originalPrice: z.string().optional(), note: z.string().optional(), image: z.string().optional() })).max(6).optional(),
      images: z.array(z.object({ url: z.string(), alt: z.string().optional() })).max(6).optional(),
      posts: z.array(z.object({ id: z.string().optional(), remove: z.boolean().optional(), format: z.enum(['post', 'square', 'story', 'wide']).optional(), title: z.string().optional(), hook: z.string().optional(), headline: z.string().optional(), sub: z.string().optional(), caption: z.string().optional(), image: z.string().optional() })).max(12).optional()
        .describe('Your own copy: replace a caption by id (offer, product-1, carousel, story, last-call, wide) or add extra posts with a headline'),
      logoUrl: z.string().optional().describe('Pro: brand logo (https)'),
      brandColor: z.string().optional().describe('Pro: brand colour, e.g. "#e11d48"'),
      brandStyle, ...copyFields,
      autoImages: z.boolean().optional().describe('Find free photos when none are given (default true)'),
      features: z.array(z.string().max(40)).max(3).optional().describe('Up to 3 short facts shown as chips on the offer post, e.g. "Free delivery in Lagos", "Cancel anytime". Only real facts from the seller.'),
      mode: z.enum(['offer', 'content']).optional().describe('"content" for everyday posts with no offer: no sale posts, prices or offer badges. Inferred as content when there is no offer.'),
      remove: z.array(z.string()).max(12).optional().describe('Post ids to leave out (offer, story, last-call, wide, carousel, product-1...).'),
      order: z.array(z.string()).max(20).optional().describe('Post ids in the order to show them.'),
      ...positioningFields,
      productPhotos: z.enum(['own', 'representative', 'none']).optional().describe('What the seller chose for products without photos: "own" (they are sending photos: pass them as products[].image), "representative" (closest real photo, tagged "Representative image"), "none" (text-led product posts). If you can generate images and the seller wants that, generate them and pass the URLs as products[].image. Ask the seller before choosing.'),
      kitId: z.string().regex(/^[a-f0-9]{12}$/).optional().describe('Update an existing kit at the same link (e.g. after the seller sends new photos)'),
      outputPath: z.string().optional().describe('Local mode: where to write the kit .html'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap((a) => kitHandler(a)));

  // ---- 0.8: brand understanding, assets, illustrations (level 2: the host AI generates) ----
  server.registerTool('brand_extract', {
    title: 'Read a brand from its website',
    description: 'Read the brand\'s own website and propose its brand profile: palette (from its CSS), heading and body fonts, wordmark case or SVG logotype, logo, a positioning line, and copy samples so you can describe the voice. Show the seller what was found and the evidence, fix anything they correct, then call again with save: true (needs connect) or pass the values to brand_profile.',
    inputSchema: { url: z.string().url().describe('The brand\'s website'), save: z.boolean().optional().describe('Save the proposed profile (after the seller confirms)'), voice: z.string().max(300).optional().describe('Your one-line read of the voice from the samples, saved with the profile') },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    const r = await extractBrand(a.url);
    const profile = { ...r.profile, ...(a.voice ? { voice: a.voice } : {}) };
    if (a.save) {
      if (!cloud.hasKey()) throw new Error(NO_KEY);
      const saved = await cloud.saveBrand(profile);
      return json({ saved: true, profile: saved.profile, ...(saved.warnings ? { warnings: saved.warnings } : {}), evidence: r.evidence });
    }
    return json({ proposed: profile, samples: r.samples, evidence: r.evidence, icons: r.icons, next: 'Show the seller this profile and evidence; ask them to confirm or correct colours, fonts and how they write their name; add your read of the voice from the samples; then call brand_extract again with save: true.' });
  }));

  const readLocalOrRemote = async (src) => {
    if (/^https:\/\//.test(src)) {
      const r = await fetch(src, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`Could not download ${src} (${r.status}).`);
      return { buf: Buffer.from(await r.arrayBuffer()), type: (r.headers.get('content-type') ?? '').split(';')[0] };
    }
    if (!allowFileWrites) throw new Error('Local files only work when Quint AI runs on your computer. Pass an https link instead.');
    if (!existsSync(src)) throw new Error(`File not found: ${src}`);
    const ext = extname(src).toLowerCase();
    return { buf: await readFile(src), type: { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' }[ext] ?? '' };
  };

  server.registerTool('asset_upload', {
    title: 'Upload a brand asset',
    description: 'Host the brand\'s own logo, wordmark SVG, illustrations, photos or web fonts on Quint AI Cloud and get a permanent link to use in pages, kits and brand_profile (every plan; Free has a small quota). Needs connect.',
    inputSchema: { file: z.string().describe('A local file path or an https link'), name: z.string().max(80).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    if (!cloud.hasKey()) throw new Error(NO_KEY);
    const { buf, type } = await readLocalOrRemote(a.file);
    return json(await cloud.uploadAsset(buf, type, a.name));
  }));

  server.registerTool('illustrate', {
    title: 'On-brand illustrations',
    description: `On-brand illustrations of real people in context, without Figma. action "generate" (Pro and above, connected): Quint AI makes them itself (best model for the job, transparent background, quality-checked with one free automatic redo), saves them to the brand and returns links; draft: true makes cheap style previews first (a tenth of an image each). "regenerate": a new version of a scene the seller did not like (uses one image). When generation is not on the plan or is busy, generate returns the free prompts instead. action "styles": three style options to show the seller once. action "prompts" (default, free on every plan): ready prompts for each scene, built from the brand profile (palette locked to hex, flat background for a clean cut-out, avoid list, audience) - if you can generate images, generate one per prompt, check them against "acceptance", then call action "register" with the image links or files. "register": makes each image a transparent cut-out (on this computer, free), uploads it and saves it to the brand profile, so pages and kits use it frameless. If you cannot generate images, say so and offer the seller's own art (asset_upload) instead. Scenes for this niche are suggested; you can describe your own.`,
    inputSchema: {
      action: z.enum(['styles', 'prompts', 'generate', 'regenerate', 'register']).optional(),
      draft: z.boolean().optional().describe('generate: cheap style previews (not saved to the brand)'),
      purpose: z.enum(['post', 'page']).optional().describe('generate: "page" for landing page images; they still work when AI images are off, and always pass the credit check'),
      count: z.number().int().min(1).max(6).optional().describe('generate: how many scenes (default 3)'),
      niche: z.string().optional(),
      scenes: z.array(z.object({ id: z.string().max(60).optional(), moment: z.string().max(300), people: z.string().max(200).optional(), mood: z.string().max(80).optional(), crop: z.string().max(40).optional(), aspect: z.enum(['1:1', '4:5', '5:4', '9:16', '16:9']).optional() })).max(6).optional(),
      style: z.enum(['flat-editorial', 'soft-line', 'textured-gouache']).optional(),
      palette: z.record(z.string(), z.string()).optional().describe('Overrides the saved brand palette'),
      audience: z.object({ region: z.string().max(60).optional(), ageRange: z.string().max(20).optional() }).optional(),
      images: z.array(z.object({ scene: z.string().max(60), file: z.string() })).max(12).optional().describe('register: generated images (https links or local files)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    const saved = cloud.hasKey() ? (await cloud.brand().catch(() => null))?.profile ?? {} : {};
    const ill = saved.illustration ?? {};
    const nicheId = classifyNiche(`${a.niche ?? saved.niche ?? ''}`).id;
    const spec = {
      palette: a.palette ?? saved.brandStyle?.palette ?? {},
      style: a.style ?? ill.style ?? 'flat-editorial',
      avoid: [...(ill.avoid ?? []), ...(saved.avoidWords ?? []), ...(saved.positioning?.isNot ?? [])],
      audience: a.audience ?? ill.audience,
      reference: ill.reference,
    };
    const action = a.action ?? 'prompts';
    if (action === 'styles') {
      const sample = (SCENES[nicheId] ?? SCENES.general)[0];
      return json({ options: Object.keys(STYLES).map((k) => ({ style: k, description: STYLES[k], samplePrompt: promptFor({ ...spec, style: k }, sample) })), next: 'Show the seller the three options (generate one sample each if you can). Save their pick with brand_profile { illustration: { style } }.' });
    }
    if (action === 'prompts') {
      return json({ style: spec.style, prompts: handoff(spec, a.scenes, nicheId), acceptance: ACCEPTANCE, ...(spec.reference ? { reference: spec.reference, referenceNote: 'Pass this image as the style reference when your image tool accepts one.' } : {}), next: 'Generate one image per prompt, check each against acceptance (regenerate up to 2 times if a check fails), then call illustrate with action "register" and the images.' });
    }
    if (action === 'generate' || action === 'regenerate') {
      const prompts = handoff(spec, a.scenes, nicheId).slice(0, a.count ?? (action === 'regenerate' ? 1 : 3));
      const freePrompts = (why) => json({ generated: [], why, style: spec.style, prompts, acceptance: ACCEPTANCE, next: 'Generate these with your own image tool if you can, check them against acceptance, then call illustrate action "register". Otherwise offer the seller their own art (asset_upload).' });
      if (!cloud.hasKey()) return freePrompts('Not connected to Quint AI Cloud, so here are the prompts (free).');
      const palette = Object.values(spec.palette ?? {}).filter((c) => /^#[0-9a-f]{3,8}$/i.test(String(c)));
      const quote = await cloud.genQuote({ [a.draft ? 'drafts' : 'images']: prompts.length, purpose: a.purpose }).catch(() => null);
      if (quote && !quote.ok) return freePrompts(`${quote.why} Nothing was used.`);
      const out = [];
      let last = null;
      for (const p of prompts) {
        const r = await cloud.genImage({ prompt: p.prompt, aspect: p.aspect, draft: a.draft === true, regenerate: action === 'regenerate', palette, purpose: a.purpose });
        last = r;
        if (!r.ok) {
          if (!out.length) return freePrompts(r.error ?? 'Generation is not available right now.');
          break;
        }
        out.push({ scene: p.scene, url: r.url, model: r.model, check: r.check, autoRedo: r.autoRedo || undefined, reused: r.reused || undefined, charged: r.charged });
      }
      if (!a.draft && out.length) {
        const scenes = [...(ill.scenes ?? []).filter((x) => !out.some((o) => o.scene === x.scene)), ...out.map(({ scene, url }) => ({ scene, url }))];
        await cloud.saveBrand({ illustration: { ...ill, style: spec.style, scenes, ...(ill.reference ? {} : { reference: out[0].url }) } });
      }
      return json({
        generated: out, draft: a.draft === true, allowance: last?.allowance, credits: last?.credits,
        ...(last && !last.ok ? { stopped: last.error } : {}),
        costNote: 'Tell the seller what this used and what is left. A final image uses 1 image and 8 credits; a draft uses a tenth of an image and 1 credit; quality redos are free; asking again with the same scene returns the stored image free. A redo the seller asks for (action "regenerate") costs the same as a new image. The seller stops at their content limit or credits, whichever comes first, and is never charged extra.',
        next: a.draft ? 'Show the seller the drafts. When they pick a direction, call generate without draft.' : 'Show the seller the illustrations. Pages and kits now use them (frameless). If one is wrong, call regenerate with that scene.',
      });
    }
    if (!a.images?.length) throw new Error('register needs images: [{ scene, file }].');
    if (!cloud.hasKey()) throw new Error(NO_KEY);
    const out = [];
    const notes = [];
    for (const im of a.images) {
      const { buf, type } = await readLocalOrRemote(im.file);
      let upBuf = buf, upType = type;
      if (allowFileWrites && /image\/(png|jpeg|webp)/.test(type)) {
        // Free local background removal so the illustration sits frameless on any page.
        try {
          const dir = resolve(tmpdir(), `quint-ill-${Date.now()}`);
          await mkdir(dir, { recursive: true });
          const src = resolve(dir, `in.${type.split('/')[1].replace('jpeg', 'jpg')}`);
          await writeFile(src, buf);
          const res = JSON.parse((await runPython([studioScript, src, resolve(dir, 'out.png'), '--transparent', '--size', '1600'])).trim().split('\n').pop());
          if (res.transparent) { upBuf = await readFile(res.output); upType = 'image/png'; }
          else notes.push(`${im.scene}: background removal needs rembg (pip install "rembg[cpu]"); uploaded as is.`);
        } catch (e) { notes.push(`${im.scene}: kept the original (${e.message}).`); }
      }
      const r = await cloud.uploadAsset(upBuf, upType, `illustration ${im.scene}`);
      out.push({ scene: im.scene, url: r.url, transparent: upType === 'image/png' });
    }
    const scenes = [...(ill.scenes ?? []).filter((x) => !out.some((o) => o.scene === x.scene)), ...out.map(({ scene, url }) => ({ scene, url }))];
    await cloud.saveBrand({ illustration: { ...ill, scenes, ...(ill.reference ? {} : { reference: out[0]?.url }) } });
    return json({ registered: out, notes, use: 'Pass these links as images (landing_page) or products[].image / posts[].image (content_kit); PNG cut-outs are laid out frameless.' });
  }));

  // ---- AI video (Studio and Business): animate an approved illustration or photo ----
  server.registerTool('video', {
    title: 'AI video from an illustration',
    description: 'Short AI videos (4 or 8 seconds) for Reels, TikTok and Status, animated from an approved illustration or product photo. Studio and Business plans (a 4-second clip uses 1 video, 8 seconds uses 2; failed videos are refunded). Uses credits (15 for 4 seconds, 30 for 8), and AI video is off until the seller turns it on: ask before enabling it with action "settings" and video: true. action "create" starts it and returns an id; "status" checks it (usually ready in 1 to 3 minutes) and returns the MP4 link, kept 90 days; "usage" shows credits, images and videos left; "settings" turns AI images or video on or off. On other plans, every kit post can still download a free motion video rendered in the browser.',
    inputSchema: {
      action: z.enum(['create', 'status', 'usage', 'settings']).optional(),
      images: z.boolean().optional().describe('settings: AI images on or off (landing page images keep working, and still use credits)'),
      video: z.boolean().optional().describe('settings: AI video on or off'),
      image: z.string().optional().describe('create: https link of the illustration or photo, or a saved illustration scene name'),
      prompt: z.string().max(1500).optional().describe('create: the motion, e.g. "she looks up from her phone and smiles; the camera holds still"'),
      seconds: z.union([z.literal(4), z.literal(8)]).optional(),
      id: z.string().optional().describe('status: the id from create'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    if (!cloud.hasKey()) throw new Error(NO_KEY);
    const action = a.action ?? (a.id ? 'status' : 'create');
    if (action === 'usage') return json(await cloud.usage());
    if (action === 'settings') return json(await cloud.genSettings(a.images === undefined && a.video === undefined ? undefined : { images: a.images, video: a.video }));
    if (action === 'status') {
      if (!a.id) throw new Error('status needs the id from create.');
      const r = await cloud.videoStatus(a.id);
      if (!r.ok) throw new Error(r.error ?? 'Could not check the video.');
      return json({ ...r, ok: undefined, ...(r.status === 'running' ? { next: 'Not ready yet. Check again in a minute.' } : {}) });
    }
    let image = a.image;
    if (image && !/^https:\/\//.test(image)) {
      const saved = (await cloud.brand().catch(() => null))?.profile?.illustration?.scenes ?? [];
      image = saved.find((x) => x.scene === image)?.url;
      if (!image) throw new Error(`No saved illustration called "${a.image}". Use illustrate first, or pass an https image link.`);
    }
    if (!image) throw new Error('create needs image: the approved illustration or photo to animate.');
    const r = await cloud.videoStart({ imageUrl: image, prompt: a.prompt, seconds: a.seconds });
    if (!r.ok) return json({ started: false, why: r.error, ...(r.upgrade ? { upgrade: r.upgrade } : {}), instead: 'Every content kit post has a free motion video (the video button on the post), rendered in the browser.' });
    return json({ started: true, id: r.id, seconds: r.seconds, charged: r.charged, allowance: r.allowance, next: `Call video with action "status" and id "${r.id}" in about a minute.` });
  }));

  // ---- 1.0: one go (report §6): brand -> plan -> illustrations -> page -> kit -> checks -> one review ----
  server.registerTool('campaign_go', {
    title: 'Whole campaign in one go',
    description: 'Build a complete, on-brand campaign from one request: reads the brand (saved profile, or its website), understands the goal, asks only blocking questions, plans the content, lists the illustrations to generate, builds the landing page and the content kit (offer or content-only), checks everything, and returns private review links. Nothing is public until the seller approves; then publish the page with publish_page (role "campaign"). Write the headline, statement, promise and captions yourself when you can and pass them in; Quint AI fills the rest plainly.',
    inputSchema: {
      request: z.string().min(3).describe('What the seller asked for, in their words'),
      brand: z.string().min(1),
      url: z.string().url().optional().describe('The brand\'s website, read when no brand profile is saved'),
      offer: z.string().optional().describe('"30% off", or "none" for content only'),
      deadline: z.string().optional(), timeZone: z.string().optional(),
      platforms: z.array(z.string()).optional(), regions: z.array(z.string()).optional(),
      products: z.array(z.object({ name: z.string(), price: z.string().optional(), originalPrice: z.string().optional(), note: z.string().optional(), image: z.string().optional() })).max(6).optional(),
      ctaUrl: z.string().optional(),
      copy: z.object({ headline: z.string().max(120).optional(), subheadline: z.string().max(240).optional(), statement: z.string().max(160).optional(), promise: z.string().max(160).optional(),
        steps: z.array(z.object({ title: z.string().max(60), text: z.string().max(200).optional() })).max(5).optional(), features: z.array(z.string().max(40)).max(3).optional(),
        posts: z.array(z.object({ id: z.string().optional(), hook: z.string().optional(), caption: z.string().optional(), format: z.enum(['post', 'square', 'story', 'wide']).optional() })).max(12).optional() }).optional()
        .describe('Your own copy in the brand voice (recommended)'),
      startDate: z.string().optional(), endDate: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    const steps = [];
    // 1. Brand: saved profile first; otherwise read the website (proposal, not saved).
    let profile = cloud.hasKey() ? (await cloud.brand().catch(() => null))?.profile ?? null : null;
    let brandNote = null;
    if (!profile?.brandStyle && a.url) {
      const ex = await extractBrand(a.url).catch((e) => ({ error: e.message }));
      if (!ex.error) { profile = { ...(profile ?? {}), ...ex.profile }; brandNote = { readFrom: ex.url, evidence: ex.evidence, confirm: 'Show the seller these colours, fonts and wordmark; save with brand_extract save: true once they confirm.' }; }
      else brandNote = { error: `Could not read ${a.url}: ${ex.error}` };
    }
    steps.push(profile?.brandStyle ? 'brand look applied' : 'no brand look yet (ask for the website or colours)');
    // 2. Understand; stop on blocking questions only.
    const understood = startCampaign({ description: `${a.request}${a.offer && a.offer !== 'none' ? ` ${a.offer}` : ''}`, brand: a.brand });
    const blocking = understood.questions.filter((q) => q.blocking);
    if (blocking.length && !profile?.niche) return json({ needsAnswer: true, askUser: blocking, understood: understood.understood, howToAsk: 'Ask these in one message, then call campaign_go again with the answers in the request.' });
    const un = understood.understood.niche;
    const niche = profile?.niche ?? (typeof un === 'string' ? un : un?.label ?? un?.id) ?? a.request;
    const contentOnly = !a.offer || /^\s*(none|no|no offer)\s*$/i.test(a.offer);
    const base = { brand: a.brand, niche, ...(profile ?? {}), ...(a.ctaUrl ? { ctaUrl: a.ctaUrl } : {}), ...(a.products ? { products: a.products } : {}) };
    // 3. Plan.
    const plan = buildPlan({ brand: a.brand, niche, platforms: a.platforms ?? understood.understood.platforms ?? ['instagram', 'whatsapp'], regions: a.regions ?? understood.understood.regions, startDate: a.startDate, endDate: a.endDate, offer: contentOnly ? undefined : a.offer, offerType: base.offerType, displayName: base.displayName });
    steps.push(`plan: ${plan.totals.slots} posts`);
    // 4. Illustrations: registered scenes are used; missing ones come back as prompts to generate.
    const nicheId = classifyNiche(niche).id;
    const scenes = profile?.illustration?.scenes ?? [];
    const prompts = scenes.length ? [] : handoff({ palette: profile?.brandStyle?.palette ?? {}, style: profile?.illustration?.style, avoid: [...(profile?.avoidWords ?? []), ...(profile?.positioning?.isNot ?? [])], audience: profile?.illustration?.audience }, null, nicheId).slice(0, 3);
    // 5. Page.
    const c = a.copy ?? {};
    const pageArgs = { ...base, headline: c.headline, subheadline: c.subheadline, statement: c.statement, promise: c.promise, steps: c.steps, features: c.features,
      ...(contentOnly ? {} : { offer: a.offer, deadline: a.deadline, timeZone: a.timeZone }),
      ...(scenes.length ? { heroImage: scenes[0].url, moments: scenes.slice(1, 4).map((x) => ({ title: x.scene.replace(/-/g, ' '), image: x.url })) } : {}),
      design: c.statement || c.promise || c.steps?.length || scenes.length ? 'story' : undefined, autoImages: false };
    const pageHtml = buildLanding(pageArgs);
    const pageChecks = runChecks('campaign_go', { kind: 'page', html: pageHtml, args: pageArgs });
    // 6. Kit (offer or content-only), hosted privately when connected.
    const kitArgs = { ...base, ...(contentOnly ? { mode: 'content' } : { offer: a.offer, deadline: a.deadline, timeZone: a.timeZone }), posts: c.posts, features: c.features, productPhotos: 'none', autoImages: false,
      ...(scenes.length ? { images: scenes.slice(0, 3).map((x) => ({ url: x.url, alt: x.scene })) } : {}) };
    const kitRes = JSON.parse((await kitHandler(kitArgs)).content[0].text);
    // 7. Review: the page goes up privately (role "review") when connected; otherwise a local file.
    let pageLink = null;
    if (cloud.hasKey() && pageChecks.passed) {
      const slug = `review-${Date.now().toString(36)}`;
      const r = await cloud.publish({ brand: a.brand, path: slug, html: pageHtml, title: `${a.brand} campaign review`, role: 'review' }).catch((e) => ({ error: e.message }));
      pageLink = r.url ?? null;
      if (r.error) steps.push(`page review upload failed: ${r.error}`);
    } else if (allowFileWrites) {
      pageLink = await maybeWrite(`${a.brand.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-campaign.html`, pageHtml, ['.html']);
    }
    return json({
      understood: understood.understood, ...(brandNote ? { brand: brandNote } : {}),
      review: { page: pageLink, kit: kitRes.url ?? kitRes.file ?? null, private: true },
      plan: { totals: plan.totals, firstWeek: plan.slots.slice(0, 7).map((x) => ({ date: x.date, platform: x.platform, format: x.format, hook: x.hook })) },
      ...(prompts.length ? { illustrationsToMake: prompts, illustrationsNote: 'On Pro and above, call illustrate action "generate" (Quint AI makes and saves them). Otherwise generate these with your own image tool if you can and register them with illustrate action "register". Then call campaign_go again: the page and kit will use them.' } : {}),
      checks: { page: pageChecks, kit: kitRes.checks },
      ...(kitRes.askUser ? { askUser: kitRes.askUser } : {}),
      steps,
      next: 'Show the seller the review links. When they approve, publish the page publicly with publish_page (role "campaign", endsAt = deadline) and share the kit posts.',
    });
  }));

  server.registerTool('kit_edit', {
    title: 'Edit a hosted content kit',
    description: 'Change a kit that is already shared, at the same link: remove posts, reorder them, replace a post\'s hook, caption, image or format, add new posts, or change settings (e.g. features, deadline). Use the kitId from content_kit.',
    inputSchema: {
      kitId: z.string().regex(/^[a-f0-9]{12}$/),
      remove: z.array(z.string()).max(12).optional().describe('Post ids to remove'),
      order: z.array(z.string()).max(20).optional().describe('Post ids in the new order'),
      posts: z.array(z.object({ id: z.string().optional(), remove: z.boolean().optional(), format: z.enum(['post', 'square', 'story', 'wide']).optional(), title: z.string().optional(), hook: z.string().optional(), headline: z.string().optional(), sub: z.string().optional(), caption: z.string().optional(), image: z.string().optional() })).max(12).optional()
        .describe('Posts to change (by id) or add'),
      set: z.record(z.string(), z.any()).optional().describe('Other content_kit settings to change, e.g. { features: [...], deadline: "..." }'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    if (!cloud.hasKey()) throw new Error(NO_KEY);
    const current = await cloud.getKit(a.kitId);
    if (!current.args) throw new Error('This kit was made before editing was available. Make it again with content_kit (pass kitId to keep the link).');
    const prev = current.args;
    const byId = new Map((prev.posts ?? []).map((x) => [x.id, x]));
    for (const x of a.posts ?? []) byId.set(x.id ?? `new-${byId.size}`, { ...(byId.get(x.id) ?? {}), ...x });
    const next = { ...prev, ...(a.set ?? {}), posts: [...byId.values()], remove: [...new Set([...(prev.remove ?? []), ...(a.remove ?? [])])], ...(a.order ? { order: a.order } : {}), kitId: a.kitId, productPhotos: prev.productPhotos ?? 'none' };
    return kitHandler(next);
  }));

  server.registerTool('unpublish', {
    title: 'Take a page or kit offline',
    description: 'Remove a published page or a content kit immediately (for example a kit made by mistake, or a sale page before the sale). Use cloud_account action "pages" to see every page and kit with its id.',
    inputSchema: { pageId: z.string().optional(), kitId: z.string().regex(/^[a-f0-9]{12}$/).optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, wrap(async (a) => {
    if (!a.pageId && !a.kitId) throw new Error('Send pageId or kitId (see cloud_account action "pages").');
    if (a.kitId) await cloud.deleteKit(a.kitId);
    if (a.pageId) await cloud.remove(a.pageId);
    return json({ ok: true, removed: a.kitId ?? a.pageId });
  }));

  // Prompts: reusable workflows for clients without skills (ChatGPT, Claude Desktop).
  server.registerPrompt('quint-campaign', {
    title: 'Plan my campaign',
    description: 'Campaign for the coming weeks: key dates, content plan, posts and a landing page.',
    argsSchema: { brand: z.string(), niche: z.string(), platforms: z.string().describe('comma-separated'), region: z.string().optional() },
  }, ({ brand, niche, platforms, region }) => ({
    messages: [{ role: 'user', content: { type: 'text', text:
`Plan a campaign for ${brand} (${niche}) on ${platforms}${region ? ` for ${region}` : ''}.
1. Call start_campaign with my request, then event_calendar for upcoming events in my region and pick the 3-5 that matter most for this niche. Explain why in one line each.
2. Ask me for my main offer, price, real previous price, and deadline if I haven't given them.
3. Call content_plan, then show the plan as a table grouped by week.
4. For the next 7 days of slots, write ready-to-post captions (within each platform's limits) and call asset_brief for each visual.
5. Offer to build a landing page with landing_page and export the plan with export_plan.
Keep every claim about prices, scarcity and deadlines true; flag anything that needs ad disclosure.` } }],
  }));

  server.registerPrompt('quint-video-script', {
    title: 'Short video script',
    description: 'Short-form video script with hook, beats, shot list and captions for an event or sale.',
    argsSchema: { brand: z.string(), product: z.string(), event: z.string().describe('event id, e.g. black-friday'), platform: z.string() },
  }, ({ brand, product, event, platform: p }) => ({
    messages: [{ role: 'user', content: { type: 'text', text:
`Write a 30-second ${p} video script for ${brand}'s ${product} for ${event}.
Call asset_brief (assetType "video", videoSeconds 30, eventId "${event}") first and follow its specs, safe zone and checklist.
Give: 3 hook options, the beat sheet with shot / on-screen text / voiceover per beat, a caption with hashtags, and the music/disclosure notes.` } }],
  }));

  return server;
}
