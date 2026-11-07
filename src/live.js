// Live data engine. Free, keyless sources:
//   - Nager.Date: official public holidays for 100+ countries, any year
//   - Google Trends daily RSS: what people in a country are searching for today
//   - Wikimedia pageviews: what the world is reading about (yesterday)
// Results are cached in memory. Every call degrades gracefully: if a source is down,
// the rest still returns and the failure is reported, never thrown.
import { addDays, diffDays, today, weekdayName } from './dates.js';
import { country } from './geo.js';

const UA = 'quint-ai-mcp (https://github.com/phestplus/quint-ai-mcp)';
const cache = new Map();

async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function get(url, { ms = 10000, type = 'json', ua = UA } = {}) {
  const res = await fetch(url, { headers: { 'user-agent': ua, accept: type === 'json' ? 'application/json' : '*/*' }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return type === 'json' ? res.json() : res.text();
}

// Topics a brand should not use for promotion.
const SENSITIVE = /\b(dies|died|death|dead|killed|kill|murder|shooting|shot|attack|bomb|terror|crash|accident|flood|earthquake|hurricane|fire|war|strike|protest|arrest|court|trial|scandal|abuse|rape|assault|funeral|obituary|hostage|riot|coup|disease|outbreak|cancer|suicide)\b/i;

/** Official public holidays for one country and year (Nager.Date). */
export async function publicHolidays(iso, year) {
  return cached(`ph:${iso}:${year}`, 24 * 3600e3, async () => {
    // Uncovered countries return an empty body (204), not JSON.
    const body = await get(`https://date.nager.at/api/v3/PublicHolidays/${year}/${iso}`, { type: 'text' });
    if (!body.trim()) throw new Error('204');
    const list = JSON.parse(body);
    return list.map((h) => ({
      id: `ph-${iso.toLowerCase()}-${h.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      name: h.name === h.localName ? h.name : `${h.name} (${h.localName})`,
      date: h.date, weekday: weekdayName(h.date), country: iso, countryName: country(iso)?.name ?? iso,
      types: h.types, nationwide: h.global !== false, source: 'nager.date',
    }));
  });
}

/** Upcoming public holidays across countries in a window. */
export async function upcomingHolidays(isos, { from = today(), days = 90 } = {}) {
  const to = addDays(from, days);
  const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])].map(Number);
  const errors = [];
  const out = [];
  await Promise.all(isos.slice(0, 8).flatMap((iso) => years.map(async (y) => {
    try { out.push(...(await publicHolidays(iso, y)).filter((h) => h.date >= from && h.date <= to)); }
    catch (e) { errors.push(`${iso} ${y}: ${e.message.includes('404') || e.message.includes('204') ? 'country not covered by nager.date' : e.message}`); }
  })));
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { holidays: out.map((h) => ({ ...h, daysUntil: diffDays(from, h.date) })), errors };
}

function rssItems(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const tag = (t) => (new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(block)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const news = [...block.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)].map((n) => ({
      title: (/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/.exec(n[1])?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim(),
      url: (/<ht:news_item_url>([\s\S]*?)<\/ht:news_item_url>/.exec(n[1])?.[1] ?? '').trim(),
      source: (/<ht:news_item_source>([\s\S]*?)<\/ht:news_item_source>/.exec(n[1])?.[1] ?? '').trim(),
    }));
    items.push({ topic: tag('title'), traffic: tag('ht:approx_traffic'), published: tag('pubDate'), news: news.slice(0, 2) });
  }
  return items;
}

/** Today's top searches in a country (Google Trends daily RSS). */
export async function trends(iso) {
  return cached(`tr:${iso}`, 30 * 60e3, async () => {
    const xml = await get(`https://trends.google.com/trending/rss?geo=${iso}`, { type: 'text', ua: 'Mozilla/5.0 (compatible; quint-ai-mcp)' });
    return rssItems(xml).map((t) => {
      const text = `${t.topic} ${t.news.map((n) => n.title).join(' ')}`;
      return { ...t, country: iso, sensitive: SENSITIVE.test(text) };
    });
  });
}

/** Most-read Wikipedia articles yesterday (en by default). */
export async function wikiTop(lang = 'en') {
  const d = addDays(today(), -1);
  return cached(`wk:${lang}:${d}`, 6 * 3600e3, async () => {
    const j = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${d.replace(/-/g, '/')}`);
    return j.items[0].articles
      .filter((a) => !/^(Main_Page|Special:|Wikipedia:|Portal:|File:|Help:|Talk:|User:|Template:|Category:)|^\.|xxx$/i.test(a.article))
      .slice(0, 25)
      .map((a) => ({ topic: a.article.replace(/_/g, ' '), views: a.views, sensitive: SENSITIVE.test(a.article.replace(/_/g, ' ')) }));
  });
}

/**
 * What is on: trending searches per country, upcoming public holidays and global reading trends.
 * @param {object} o
 * @param {string[]} o.countries ISO codes (max 4 for trends)
 * @param {string} [o.niche] niche label/keywords, to point out topics that fit
 * @param {string[]} [o.keywords] words that make a trend relevant to this business
 * @param {number} [o.days] holiday look-ahead (default 60)
 */
export async function whatsOn(o) {
  const countries = (o.countries?.length ? o.countries : ['US']).slice(0, 4);
  const errors = [];
  const [trendLists, hol, wiki] = await Promise.all([
    Promise.all(countries.map((c) => trends(c).catch((e) => { errors.push(`trends ${c}: ${e.message}`); return []; }))),
    upcomingHolidays(countries, { days: o.days ?? 60 }).catch((e) => { errors.push(`holidays: ${e.message}`); return { holidays: [], errors: [] }; }),
    wikiTop().catch((e) => { errors.push(`wikipedia: ${e.message}`); return []; }),
  ]);
  errors.push(...hol.errors);
  const kw = (o.keywords ?? []).map((k) => k.toLowerCase());
  const fits = (text) => kw.some((k) => text.toLowerCase().includes(k));
  const trending = trendLists.flat().map((t) => ({ ...t, fitsNiche: fits(`${t.topic} ${t.news.map((n) => n.title).join(' ')}`) }));
  return {
    fetchedAt: new Date().toISOString(),
    trending: trending.slice(0, 15 * countries.length),
    // "Use" means safe AND relevant to this business; safe-but-unrelated topics are listed separately.
    use: kw.length ? trending.filter((t) => !t.sensitive && t.fitsNiche).slice(0, 10).map((t) => t.topic) : [],
    safeButUnrelated: trending.filter((t) => !t.sensitive && !(kw.length && t.fitsNiche)).slice(0, 10).map((t) => t.topic),
    ...(kw.length && !trending.some((t) => !t.sensitive && t.fitsNiche) ? { nothingFitsToday: 'None of the trends today fit this business. Skip trend posts today and use the content plan instead.' } : {}),
    avoid: trending.filter((t) => t.sensitive).map((t) => t.topic),
    publicHolidays: hol.holidays,
    worldReading: wiki.filter((w) => !w.sensitive).slice(0, 10),
    guidance: [
      'Only join a trend if your audience cares about it and you can add something real (a take, a tip, humour that fits the brand).',
      'Never use tragedies, crime, politics or health scares for promotion. Topics flagged sensitive are listed under "avoid".',
      'Move fast: daily trends fade in 24 to 48 hours. A quick story or short video beats a polished post tomorrow.',
      'Public holidays change shopping hours and delivery times: post opening hours and order-by dates.',
    ],
    errors,
  };
}
