import { EVENTS } from './events.js';
import { addDays, diffDays, easter, nthWeekday, pad, parse, today, weekday, weekdayName } from './dates.js';
import { YEAR_GLOBAL_REACH } from './events-year.js';

const byId = new Map(EVENTS.map((e) => [e.id, e]));

// Resolve an event's start date for the season of `year`. Returns null when unknown.
export function resolveDate(event, year) {
  const y = event.nextYear ? year + 1 : year;
  const r = event.rule;
  if (r.fixed) return `${y}-${pad(r.fixed[0])}-${pad(r.fixed[1])}`;
  if (r.nth) return nthWeekday(y, r.nth[0], r.nth[1], r.nth[2]);
  if (r.after) {
    const base = resolveDate(byId.get(r.after[0]), year);
    return base && addDays(base, r.after[1]);
  }
  if (r.lastWeekdayBefore) {
    const [m, d, wd] = r.lastWeekdayBefore;
    let s = addDays(`${y}-${pad(m)}-${pad(d)}`, -1);
    while (weekday(s) !== wd) s = addDays(s, -1);
    return s;
  }
  if (r.easter !== undefined) return addDays(easter(y), r.easter);
  if (r.table) return r.table[y] ?? null;
  return null;
}

function fillTokens(text, year) {
  return text.replace('{year}', String(year)).replace('{ngAge}', String(year - 1960));
}

function materialize(event, year, ref) {
  const date = resolveDate(event, year);
  if (!date) return null;
  const durationDays = event.durationDays ?? 1;
  const endDate = addDays(date, durationDays - 1);
  const promoStart = addDays(date, -event.leadDays);
  return {
    id: event.id,
    name: event.name,
    date,
    endDate,
    weekday: weekdayName(date),
    durationDays,
    category: event.category,
    regions: event.regions,
    impact: event.impact,
    promoStart,
    leadDays: event.leadDays,
    daysUntil: diffDays(ref, date),
    status: diffDays(ref, endDate) < 0 ? 'past' : diffDays(ref, date) <= 0 ? 'live' : diffDays(ref, promoStart) <= 0 ? 'promo-window' : 'upcoming',
    angles: event.angles,
    hashtags: event.hashtags.map((h) => fillTokens(h, year)),
    salesAppropriate: !event.noSales,
    ...(event.note ? { note: event.note } : {}),
  };
}

const IMPACT_RANK = { high: 3, medium: 2, low: 1 };

/**
 * List events.
 * @param {object} o
 * @param {number} [o.year] season year (default: year of `from` or today)
 * @param {string} [o.from] YYYY-MM-DD inclusive (default: Oct 1)
 * @param {string} [o.to] YYYY-MM-DD inclusive (default: Jan 1 next year)
 * @param {string[]} [o.regions] e.g. ['US','NG']; events tagged 'global' always match
 * @param {string[]} [o.categories]
 * @param {string} [o.minImpact] low | medium | high
 * @param {string} [o.referenceDate] for daysUntil/status (default: today)
 * @param {boolean} [o.includePast] include events that already ended (default false)
 */
export function listEvents(o = {}) {
  const ref = o.referenceDate ?? today();
  // Default window: a whole year when a year is given, otherwise the next 90 days.
  const year = o.year ?? Number((o.from ?? ref).slice(0, 4));
  const from = o.from ?? (o.year ? `${year}-01-01` : ref);
  const to = o.to ?? (o.year ? `${year + 1}-01-01` : addDays(from, 90));
  parse(from); parse(to);
  const regions = o.regions?.length ? o.regions.map((r) => r.toUpperCase() === 'GLOBAL' ? 'global' : r.toUpperCase()) : null;
  const minRank = IMPACT_RANK[o.minImpact ?? 'low'];

  const seasons = new Set([Number(from.slice(0, 4)) - 1, Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
  const out = [];
  const seen = new Set();
  for (const y of seasons) {
    for (const e of EVENTS) {
      const m = materialize(e, y, ref);
      if (!m) continue;
      const key = `${m.id}@${m.date}`;
      if (seen.has(key)) continue;
      if (m.endDate < from || m.date > to) continue;
      if (regions && !m.regions.some((r) => r === 'global' || regions.includes(r))) continue;
      if (o.categories?.length && !o.categories.includes(m.category)) continue;
      if (IMPACT_RANK[m.impact] < minRank) continue;
      if (!o.includePast && m.status === 'past') continue;
      seen.add(key);
      out.push(m);
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact]));
  return out;
}

export function getEvent(id, year, ref = today()) {
  const e = byId.get(id);
  return e ? materialize(e, year, ref) : null;
}

export const EVENT_IDS = EVENTS.map((e) => e.id);

// How strongly a 'global'-tagged event applies outside its home regions (0..1).
// Black Friday is truly worldwide; Singles' Day or Diwali matter mainly to their home audiences and diaspora.
const GLOBAL_REACH = {
  'black-friday': 0.95, 'cyber-monday': 0.9, christmas: 0.95, 'christmas-eve': 0.8, 'new-years-eve': 0.9, 'new-year': 0.9,
  'giving-tuesday': 0.5, 'shipping-cutoff': 0.8, 'singles-day': 0.35, diwali: 0.3, dhanteras: 0.15, hanukkah: 0.3,
  halloween: 0.6, movember: 0.4, 'breast-cancer-awareness': 0.5, 'world-mental-health-day': 0.5, 'world-kindness-day': 0.4, 'winter-solstice': 0.3,
  ...YEAR_GLOBAL_REACH,
};

/**
 * Score how much an event matters for this audience and niche.
 * @returns {{ score:number, reasons:string[] }} score is roughly 0..4
 */
export function relevance(ev, regions = [], eventFit = {}) {
  const reasons = [];
  const home = ev.regions.filter((r) => r !== 'global');
  let regionScore;
  if (!regions.length) { regionScore = ev.regions.includes('global') ? (GLOBAL_REACH[ev.id] ?? 0.6) : 0.5; }
  else if (home.some((r) => regions.includes(r))) { regionScore = 1; reasons.push(`celebrated in ${home.filter((r) => regions.includes(r)).join(', ')}`); }
  else if (ev.regions.includes('global')) { regionScore = GLOBAL_REACH[ev.id] ?? 0.6; reasons.push(regionScore >= 0.8 ? 'shopping event worldwide' : 'mainly a home-market or diaspora event'); }
  else regionScore = 0;
  const fit = eventFit[ev.id] ?? 1;
  if (fit > 1.15) reasons.push('strong fit for this niche');
  if (fit < 0.7) reasons.push('weak fit for this niche');
  const impact = { high: 3, medium: 2, low: 1 }[ev.impact];
  return { score: Math.round(impact * regionScore * fit * 100) / 100, reasons };
}
