// Turns loose, real-world input ("ig and tik tok", "Lagos", "30 percent off",
// "Nov 30", "black friday") into the exact values the engine needs. Every
// function reports what it could not understand instead of throwing.
import { EVENTS } from './events.js';
import { pad } from './dates.js';
import { findPlaces, regionsFor, resolvePlace } from './geo.js';

const PLATFORM_ALIASES = {
  instagram: ['instagram', 'insta', 'ig', 'reels', 'reel', 'instagram reels', 'gram'],
  tiktok: ['tiktok', 'tik tok', 'tt', 'tik-tok'],
  youtube: ['youtube', 'yt', 'shorts', 'youtube shorts'],
  linkedin: ['linkedin', 'linked in', 'li'],
  x: ['x', 'twitter', 'tweet', 'tweets', 'x.com'],
  facebook: ['facebook', 'fb', 'meta', 'facebook reels'],
  pinterest: ['pinterest', 'pin', 'pins'],
  threads: ['threads'],
  whatsapp: ['whatsapp', 'whats app', 'wa', 'whatsapp status', 'status', 'whatsapp business', 'broadcast'],
  email: ['email', 'e-mail', 'newsletter', 'mail', 'mailchimp', 'klaviyo', 'emails', 'substack', 'convertkit', 'kit'],
};

const REGION_ALIASES = {
  NG: ['ng', 'nigeria', 'naija', 'lagos', 'abuja', 'port harcourt', 'ibadan', 'kano', 'enugu', 'benin city'],
  US: ['us', 'usa', 'u.s.', 'america', 'united states', 'new york', 'nyc', 'la', 'los angeles', 'texas', 'houston', 'atlanta', 'chicago', 'miami', 'california'],
  UK: ['uk', 'u.k.', 'united kingdom', 'britain', 'england', 'london', 'manchester', 'scotland', 'wales', 'gb'],
  CA: ['ca', 'canada', 'toronto', 'vancouver', 'montreal', 'calgary'],
  AU: ['au', 'australia', 'sydney', 'melbourne', 'brisbane', 'perth'],
  IN: ['in', 'india', 'mumbai', 'delhi', 'bangalore', 'bengaluru', 'chennai', 'hyderabad'],
  MX: ['mx', 'mexico', 'méxico', 'mexico city'],
  CN: ['cn', 'china', 'shanghai', 'beijing'],
  EU: ['eu', 'europe', 'germany', 'france', 'spain', 'italy', 'netherlands', 'ireland', 'portugal', 'belgium', 'sweden', 'poland', 'berlin', 'paris', 'madrid', 'dublin', 'amsterdam'],
  global: ['global', 'worldwide', 'international', 'everywhere', 'world', 'online'],
};

const CURRENCY_BY_REGION = { NG: 'NGN', US: 'USD', UK: 'GBP', CA: 'CAD', AU: 'AUD', IN: 'INR', MX: 'MXN', CN: 'CNY', EU: 'EUR' };

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const clean = (s) => String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');

function splitList(v) {
  if (Array.isArray(v)) return v.flatMap(splitList);
  return String(v ?? '').split(/,|\/|\band\b|&|\+|;|\n/).map(clean).filter(Boolean);
}

function lookup(aliases, token) {
  for (const [id, list] of Object.entries(aliases)) if (list.includes(token)) return id;
  return null;
}

/** "ig, tik tok and newsletter" -> { values: ['instagram','tiktok','email'], unknown: [] } */
export function normalizePlatforms(input) {
  const values = [], unknown = [];
  for (const tok of splitList(input)) {
    const id = lookup(PLATFORM_ALIASES, tok) ?? lookup(PLATFORM_ALIASES, tok.replace(/s$/, ''));
    if (id) { if (!values.includes(id)) values.push(id); } else unknown.push(tok);
  }
  return { values, unknown };
}

/** "Lagos and London" -> { values: ['NG','UK'], unknown: [] } */
/**
 * "Lagos and London", "West Africa", "GH", "worldwide"
 * -> { values: curated regions (NG, UK, ... or 'global'), countries: ISO codes, unknown }
 * Countries outside the curated regions still resolve (their holidays come from live data).
 */
export function normalizeRegions(input) {
  const values = [], countries = [], unknown = [];
  for (const tok of splitList(input)) {
    if (REGION_ALIASES.global.includes(tok)) { if (!values.includes('global')) values.push('global'); continue; }
    const isos = resolvePlace(tok);
    if (!isos.length) { unknown.push(tok); continue; }
    for (const iso of isos) if (!countries.includes(iso)) countries.push(iso);
  }
  for (const r of regionsFor(countries)) if (!values.includes(r)) values.push(r);
  return { values, countries, unknown };
}

/** Curated regions mentioned anywhere in free text (cities, countries, continents). */
export function findRegionInText(text) {
  return regionsFor(findPlaces(text).countries);
}

/** ISO countries mentioned anywhere in free text. */
export function findCountriesInText(text) {
  return findPlaces(text).countries;
}

export function findPlatformsInText(text) {
  const t = ` ${clean(text).replace(/[^a-z0-9.\s]/g, ' ')} `;
  const out = [];
  for (const [id, list] of Object.entries(PLATFORM_ALIASES)) {
    // Skip ambiguous short aliases in free text ("in", "la", "x", "pin", "status", "mail").
    if (list.some((a) => a.length > 2 && !['status', 'mail', 'pin', 'kit', 'meta', 'broadcast'].includes(a) && t.includes(` ${a} `))) out.push(id);
    else if (id === 'instagram' && / ig /.test(t)) out.push(id);
    else if (id === 'x' && /\btwitter\b/.test(t)) out.push(id);
  }
  return [...new Set(out)];
}

export function currencyFor(regions) {
  const r = (regions ?? []).find((x) => CURRENCY_BY_REGION[x]);
  return r ? CURRENCY_BY_REGION[r] : 'USD';
}

/**
 * Parse an offer written any way.
 * "30% off", "30 percent off everything", "N5,000 off", "buy 1 get 1", "BOGO", "free shipping", "2 for 1"
 * -> { type: 'percent'|'amount'|'bogo'|'free-shipping'|'gift'|'other', value, text }
 */
export function parseOffer(text) {
  if (!text) return null;
  const s = String(text).trim();
  const l = s.toLowerCase();
  let m = /(\d{1,2}(?:\.\d+)?)\s*(?:%|percent|per cent|pct)/.exec(l);
  if (m) return { type: 'percent', value: Number(m[1]), text: s };
  m = /([$£€₦₹]|ngn|usd|gbp|eur|inr|n)\s?([\d,]+(?:\.\d+)?)\s*(?:k\b)?\s*off/.exec(l);
  if (m) return { type: 'amount', value: Number(m[2].replace(/,/g, '')) * (/\dk\b/.test(l) ? 1000 : 1), currencySymbol: m[1], text: s };
  if (/\bbogo\b|buy\s*(one|1)\s*get\s*(one|1)|2\s*for\s*1|two\s*for\s*one/.test(l)) return { type: 'bogo', value: null, text: s };
  if (/free\s*(shipping|delivery)/.test(l)) return { type: 'free-shipping', value: null, text: s };
  if (/free\s*gift|gift\s*with\s*purchase|gwp/.test(l)) return { type: 'gift', value: null, text: s };
  return { type: 'other', value: null, text: s };
}

const EVENT_NAMES = EVENTS.map((e) => ({ id: e.id, names: [e.id.replace(/-/g, ' '), clean(e.name).replace(/\(.*?\)/g, '').trim()] }));

/** Find an event mentioned in text: "for bf", "black friday", "xmas", "11.11". */
export function findEventsInText(text) {
  const t = ` ${clean(text).replace(/[^a-z0-9.'\s]/g, ' ')} `;
  const extra = { 'black-friday': [' bf ', 'black friday', 'blackfriday'], 'cyber-monday': [' cm ', 'cyber monday', 'cyber week'], christmas: ['xmas', 'christmas', 'x-mas', 'festive season', 'holidays', 'holiday season'], 'new-year': ['new year', 'newyear', ' ny '], 'singles-day': ['11.11', 'singles day', "singles' day", 'double eleven'], diwali: ['diwali', 'deepavali'], 'boxing-day': ['boxing day'], halloween: ['halloween'], hanukkah: ['hanukkah', 'chanukah'], 'us-thanksgiving': ['thanksgiving'], 'new-years-eve': ['nye', "new year's eve", 'new years eve'] };
  const found = [];
  for (const [id, keys] of Object.entries(extra)) if (keys.some((k) => t.includes(k.startsWith(' ') ? k : ` ${k}`) || t.includes(k))) found.push(id);
  for (const e of EVENT_NAMES) if (!found.includes(e.id) && e.names.some((n) => n.length > 6 && t.includes(n))) found.push(e.id);
  return found;
}

/**
 * Loose date: "2026-11-30", "Nov 30", "30 November", "30/11", "11/30" (US if region US),
 * or an event name ("black friday"). Returns 'YYYY-MM-DD' or null.
 */
export function parseLooseDate(input, { year, regions = [], resolveEvent } = {}) {
  if (!input) return null;
  const s = clean(input);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const y = year ?? new Date().getFullYear();
  let m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})/.exec(s) || null;
  if (m) { const mi = MONTHS.indexOf(m[2].slice(0, 3)); if (mi >= 0) return `${y}-${pad(mi + 1)}-${pad(Number(m[1]))}`; }
  m = /^([a-z]{3,})\s+(\d{1,2})/.exec(s);
  if (m) { const mi = MONTHS.indexOf(m[1].slice(0, 3)); if (mi >= 0) return `${y}-${pad(mi + 1)}-${pad(Number(m[2]))}`; }
  m = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/.exec(s);
  if (m) {
    // Unambiguous when one side is over 12; otherwise month-first only for US-only audiences.
    const usOnly = regions.length > 0 && regions.every((r) => r === 'US');
    const [a, b] = [Number(m[1]), Number(m[2])];
    const [mo, d] = a > 12 ? [b, a] : b > 12 ? [a, b] : usOnly ? [a, b] : [b, a];
    const yy = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : y;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${yy}-${pad(mo)}-${pad(d)}`;
  }
  const ev = findEventsInText(s)[0];
  if (ev && resolveEvent) return resolveEvent(ev, y);
  return null;
}
