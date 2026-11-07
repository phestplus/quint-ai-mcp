import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlatforms, normalizeRegions, parseOffer, parseLooseDate, findEventsInText, findCountriesInText } from '../src/normalize.js';
import { classifyNiche } from '../src/niches.js';
import { startCampaign } from '../src/start.js';
import { getEvent, listEvents } from '../src/calendar.js';
import { easter } from '../src/dates.js';
import { buildPlan } from '../src/plan.js';
import { buildBrief } from '../src/brief.js';

test('platform aliases', () => {
  assert.deepEqual(normalizePlatforms('ig, tik tok and newsletter').values, ['instagram', 'tiktok', 'email']);
  assert.deepEqual(normalizePlatforms(['Insta', 'WhatsApp status', 'twitter']).values, ['instagram', 'whatsapp', 'x']);
  assert.deepEqual(normalizePlatforms('myspace').unknown, ['myspace']);
});

test('places: cities, countries, continents, codes', () => {
  assert.deepEqual(normalizeRegions('Lagos and London').countries, ['NG', 'GB']);
  assert.deepEqual(normalizeRegions('Lagos and London').values, ['NG', 'UK']);
  assert.ok(normalizeRegions('West Africa').countries.includes('GH'));
  assert.deepEqual(normalizeRegions('Dubai').values, ['ME']);
  assert.deepEqual(normalizeRegions('worldwide').values, ['global']);
  assert.deepEqual(findCountriesInText('we are in la'), [], 'ambiguous lowercase codes are ignored');
  assert.deepEqual(findCountriesInText('shop in houston texas'), ['US']);
});

test('offers written any way', () => {
  assert.deepEqual(parseOffer('30 percent off everything'), { type: 'percent', value: 30, text: '30 percent off everything' });
  assert.equal(parseOffer('BOGO on all tees').type, 'bogo');
  assert.equal(parseOffer('free delivery in Lagos').type, 'free-shipping');
  assert.equal(parseOffer('N5,000 off').value, 5000);
});

test('loose dates and event names', () => {
  assert.equal(parseLooseDate('Nov 30', { year: 2026 }), '2026-11-30');
  assert.equal(parseLooseDate('30th November', { year: 2026 }), '2026-11-30');
  assert.equal(parseLooseDate('30/11', { year: 2026, regions: ['NG'] }), '2026-11-30');
  assert.equal(parseLooseDate('11/30', { year: 2026, regions: ['US'] }), '2026-11-30');
  assert.equal(parseLooseDate('03/04', { year: 2027, regions: ['US'] }), '2027-03-04', 'US-only audiences read month first');
  assert.equal(parseLooseDate('03/04', { year: 2027, regions: ['UK'] }), '2027-04-03');
  assert.deepEqual(findEventsInText('need bf and xmas content'), ['black-friday', 'christmas']);
});

test('niche classification', () => {
  assert.equal(classifyNiche('i sell sneakers in lagos').id, 'footwear');
  assert.equal(classifyNiche('ankara dresses boutique').id, 'fashion');
  assert.equal(classifyNiche('used cars dealership').id, 'automotive');
  assert.equal(classifyNiche('online course for designers').id, 'courses');
  assert.equal(classifyNiche('pls help me sell more').id, 'general');
});

test('year-round dates', () => {
  assert.deepEqual([2024, 2025, 2026, 2027, 2028].map(easter), ['2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2028-04-16']);
  assert.equal(getEvent('mothering-sunday', 2027, '2027-01-01').date, '2027-03-07');
  assert.equal(getEvent('mothers-day', 2027, '2027-01-01').date, '2027-05-09');
  assert.equal(getEvent('fathers-day', 2027, '2027-01-01').date, '2027-06-20');
  assert.equal(getEvent('memorial-day', 2027, '2027-01-01').date, '2027-05-31');
  assert.equal(getEvent('lunar-new-year', 2027, '2027-01-01').date, '2027-02-06');
  assert.ok(getEvent('eid-al-fitr', 2027, '2027-01-01').note, 'moon-sighted dates carry a note');
  const next90 = listEvents({ referenceDate: '2027-01-20' }).map((e) => e.id);
  assert.ok(next90.includes('valentines') && next90.includes('easter'));
  assert.ok(!next90.includes('black-friday'), 'default window is the next 90 days');
});

test('relevance keeps irrelevant events out', () => {
  const p = buildPlan({ brand: 'Kora', niche: 'sneakers', platforms: 'ig', regions: 'Lagos', startDate: '2026-11-02', endDate: '2026-12-02' });
  const ids = p.eventsCovered.map((e) => e.id);
  assert.ok(ids.includes('black-friday'));
  assert.ok(!ids.includes('diwali') && !ids.includes('dhanteras'));
  assert.ok(p.interpreted.notes.some((n) => /Diwali/.test(n)), 'tells the user what was left out');
});

test('cadence: email and WhatsApp stay low, social posts on every launch', () => {
  const p = buildPlan({ brand: 'Kora', niche: 'sneakers', platforms: 'ig, email, whatsapp', regions: 'Lagos, USA', startDate: '2026-11-02', endDate: '2026-12-06', postsPerWeek: 5 });
  const perWeek = {};
  for (const s of p.slots) { const k = `${s.platform}:${Math.floor((Date.parse(s.date) - Date.parse('2026-11-02')) / 6048e5)}`; perWeek[k] = (perWeek[k] ?? 0) + 1; }
  for (const [k, n] of Object.entries(perWeek)) if (k.startsWith('email')) assert.ok(n <= 3, `${k} = ${n}`);
  const launches = ['2026-11-27', '2026-11-30'];
  for (const d of launches) assert.ok(p.slots.some((s) => s.date === d && s.platform === 'instagram'), d);
});

test('niche-aware angles, hooks and shots', () => {
  const p = buildPlan({ brand: 'Kora', niche: 'sneakers', platforms: 'tiktok', regions: 'Lagos', startDate: '2026-11-10', endDate: '2026-11-30' });
  const text = JSON.stringify(p.slots);
  assert.ok(!/digital products and courses|Screen recording/i.test(text));
  assert.ok(/pair|sole|lace|fit/i.test(text));
  const b = buildBrief({ platform: 'tik tok', assetType: 'video', brand: 'Kora', niche: 'sneakers', eventId: 'black-friday' });
  assert.ok(b.video.shotList.some((s) => /sole|lace|on-foot/i.test(s)));
  const car = buildBrief({ platform: 'facebook', assetType: 'post', brand: 'Drive', niche: 'used cars' });
  assert.ok(car.checklist.some((c) => /APR/.test(c)), 'auto finance disclosure');
});

test('start_campaign: messy prompts, non-blocking questions', () => {
  const a = startCampaign({ description: 'black friday sale for my online course, 50% off, ends nov 30', today: '2026-11-02' });
  assert.equal(a.understood.deadline, '2026-11-30');
  assert.ok(!a.events.some((e) => e.id === 'shipping-cutoff'), 'digital products do not ship');
  const b = startCampaign({ description: 'used cars dealership houston, want to push december deals on facebook', today: '2026-11-02' });
  assert.equal(b.mainEvent.id, 'christmas');
  assert.deepEqual(b.understood.platforms, ['facebook']);
  const c = startCampaign({ description: 'pls help me sell more', today: '2026-11-02' });
  assert.ok(c.questions.length > 0 && c.questions.length <= 3);
  // Not knowing what is sold blocks: plan, posts and page all depend on it. Everything else has a default.
  assert.ok(c.questions.some((q) => q.field === 'product' && q.blocking === true));
  assert.ok(c.questions.filter((q) => q.field !== 'product').every((q) => q.blocking === false && q.defaultUsed));
  assert.equal(c.canProceed, false);
  const d = startCampaign({ description: 'relationship and marriage app with subscriptions in Nigeria, 30% off yearly plans for black friday', today: '2026-11-02' });
  assert.equal(d.understood.niche ?? d.niche?.id ?? d.understood.nicheId, d.understood.niche ?? d.niche?.id ?? d.understood.nicheId);
});

test('subscription apps get subscription copy, never retail lines', async () => {
  const { classifyNiche } = await import('../src/niches.js');
  assert.equal(classifyNiche('habit tracking app with subscriptions').id, 'apps');
  const { buildPlan } = await import('../src/plan.js');
  const p = buildPlan({ brand: 'Brightly', niche: 'habit tracking app with subscriptions', product: 'Brightly Premium and Family yearly plans', platforms: ['instagram', 'whatsapp'], regions: ['NG'], startDate: '2026-11-06', endDate: '2026-11-28', offer: '30% off' });
  const text = p.slots.map((s) => `${s.hook ?? ''} ${s.cta ?? ''}`).join(' | ');
  assert.ok(!/cart|wishlist|shop now|on the way|wearing|order/i.test(text), text.match(/.*(cart|wishlist|shop now|on the way|wearing|order).*/i)?.[0]);
  assert.ok(!/Premium and Family yearly plans/.test(text), 'long raw product phrases are not pasted into hooks');
  assert.ok(/Start your plan/.test(text));
  const { buildKit } = await import('../src/kit.js');
  const k = buildKit({ brand: 'Brightly', niche: 'habit tracking app', product: 'Brightly Premium and Family yearly plans', discountPercent: 30, ctaUrl: 'https://example.com/premium', products: [{ name: 'Premium yearly', price: '₦31,500', originalPrice: '₦45,000' }], posts: [{ id: 'offer', headline: 'Small habits, kept all year. 30% off this Black Friday.' }] });
  const caps = k.posts.flatMap((x) => Object.values(x.caption)).join(' | ');
  assert.ok(!/cart|Reply to this message to order|#BrightlyPremium/i.test(caps));
  assert.equal(k.posts.find((x) => x.id === 'offer').hook, 'Small habits, kept all year. 30% off this Black Friday.', 'the AI headline becomes the hook');
});

test('content-only kits: no sale posts, prices, stickers or offer badges', async () => {
  const { buildKit } = await import('../src/kit.js');
  const k = buildKit({ brand: 'Brightly', niche: 'habit tracking app', theme: 'default', ctaUrl: 'https://example.com', products: [{ name: 'Premium yearly', price: '₦31,500', originalPrice: '₦45,000' }] });
  assert.equal(k.contentOnly, true);
  const text = k.html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '');
  assert.ok(!/₦31,500|₦45,000/.test(text), 'saved prices are not shown without an offer');
  assert.ok(!/Limited-time offer/i.test(text), 'no offer badge from the default theme');
  assert.ok(!k.posts.some((p) => ['offer', 'story', 'last-call', 'wide'].includes(p.id)), 'no sale slots');
  assert.ok(!/g-stk/.test(text), 'no discount sticker');
  const caps = k.posts.flatMap((p) => Object.values(p.caption)).join(' | ');
  assert.ok(!/Start your plan|Order here|₦/.test(caps), caps);
});

test('kit slots: AI hooks reach the graphic; title, format, removal and order are kept', async () => {
  const { buildKit } = await import('../src/kit.js');
  const k = buildKit({ brand: 'Brightly', niche: 'habit tracking app', discountPercent: 30, price: '₦31,500', ctaUrl: 'https://example.com', deadline: '2026-11-27T23:59:00+01:00',
    posts: [{ id: 'offer', hook: 'Small habits, kept all year.', title: 'Launch post' }, { id: 'wide', remove: true }, { id: 'tease', hook: 'Something calm is coming.', format: 'story' }], order: ['tease', 'offer'] });
  const offer = k.posts.find((p) => p.id === 'offer');
  assert.equal(offer.title, 'Launch post');
  assert.ok(k.html.includes('Small habits, kept all year.'), 'the hook is drawn on the graphic');
  assert.ok(!k.posts.some((p) => p.id === 'wide'), 'removed slot is gone');
  const tease = k.posts.find((p) => p.id === 'tease');
  assert.equal(tease.format, 'story', 'the requested format is kept');
  assert.deepEqual(k.posts.slice(0, 2).map((p) => p.id), ['tease', 'offer']);
  assert.ok(!/text-transform:uppercase/.test(k.html.match(/\.g-h\{[^}]*\}/)[0]), 'headlines are not forced into capitals');
});

test('wordmark keeps the brand name as the brand writes it', async () => {
  const { wordmarkHtml } = await import('../src/brand.js');
  const w = wordmarkHtml({ brand: 'Brightly', brandStyle: { wordmark: { text: 'brightly', case: 'lower', weight: 800, highlight: [{ from: 1, to: 3, color: '#8b72a8' }] } } });
  assert.match(w, /text-transform:none/);
  assert.match(w, /b<span style="color:#8b72a8">ri<\/span>ghtly/);
  assert.ok(!/onload/.test(wordmarkHtml({ brand: 'x', brandStyle: { wordmark: { svg: '<svg onload="alert(1)"></svg>' } } })), 'unsafe SVG is not used');
});

test('illustration prompts follow the accepted recipe', async () => {
  const { promptFor, handoff, SCENES } = await import('../src/illustrate.js');
  const p = promptFor({ palette: { bg: '#F5EFE8', text: '#493A35', accent: '#8B72A8' }, style: 'flat-editorial', avoid: ['swipe cards'], audience: { region: 'West Africa', ageRange: '25-40' } }, SCENES.apps[0]);
  assert.match(p, /Premium modern editorial illustration/);
  assert.match(p, /Colour palette strictly: #F5EFE8 \(bg\), #493A35 \(text\), #8B72A8 \(accent\)/);
  assert.match(p, /one flat solid plain #F5EFE8 colour filling the whole image/, 'flat background for a clean cut-out');
  assert.match(p, /No text, no letters, no logos, no watermark, no hearts, no frames, no borders, no swipe cards/);
  assert.match(p, /West Africa, aged 25-40/);
  const list = handoff({ palette: {} }, null, 'apps');
  assert.ok(list.length >= 3 && list.every((x) => x.prompt && x.size));
  assert.ok(!/[—–]/.test(p));
});

test('brand_extract reads palette, fonts, wordmark and logo from the brand\'s own site', async () => {
  const { analyse } = await import('../src/extract.js');
  const html = '<html><head><title>brightly | Habits that last</title><meta name="description" content="A calm habit tracker for busy families."><link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter:wght@400" rel="stylesheet"><style>:root{--bg:#F5EFE8;--text:#493A35;--accent:#8B72A8}h1{font-family:Fraunces,serif}body{font-family:Inter,sans-serif}</style></head><body><a class="logo" href="/"><img src="/logo.svg" alt="brightly"></a><h1>Small habits, kept all year.</h1></body></html>';
  const r = analyse(html, '', 'https://brightly.example/');
  assert.deepEqual(r.profile.brandStyle.palette, { bg: '#f5efe8', text: '#493a35', accent: '#8b72a8' });
  assert.equal(r.profile.brandStyle.mode, 'light');
  assert.equal(r.profile.brandStyle.fontDisplay, 'Fraunces');
  assert.equal(r.profile.brandStyle.wordmark.case, 'lower');
  assert.equal(r.profile.logoUrl, 'https://brightly.example/logo.svg');
  assert.equal(r.samples.h1, 'Small habits, kept all year.');
  assert.ok(r.evidence.length >= 2);
});

test('every planned post has a posting time, the seller can set their own, and calendars keep it', async () => {
  const { toICS } = await import('../src/export.js');
  const p = buildPlan({ brand: 'Kora', niche: 'sneakers', platforms: 'ig, whatsapp, email', regions: 'Lagos', startDate: '2026-11-16', endDate: '2026-11-29' });
  assert.ok(p.slots.length > 0);
  for (const s of p.slots) assert.match(s.time, /^\d{2}:\d{2}$/, `${s.platform} ${s.date}`);
  assert.match(p.timesNote, /suggestions/);
  const mine = buildPlan({ brand: 'Kora', niche: 'sneakers', platforms: 'ig', regions: 'Lagos', startDate: '2026-11-16', endDate: '2026-11-29', postTimes: { instagram: '18:15' } });
  assert.ok(mine.slots.every((s) => s.time === '18:15'));
  const ics = toICS(p.slots);
  assert.match(ics, /DTSTART:\d{8}T\d{6}/);
  assert.ok(!/VALUE=DATE/.test(ics), 'calendar entries are at a time, not all day');
});
