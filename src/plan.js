import { listEvents, relevance } from './calendar.js';
import { addDays, diffDays, parse, today, weekday, weekdayName } from './dates.js';
import { classifyNiche, NICHES, phaseAngles, SHIPPING_EVENTS, shipsByPost } from './niches.js';
import { findEventsInText, normalizePlatforms, normalizeRegions, parseOffer } from './normalize.js';
import { PLATFORMS } from './specs.js';
import { hookDeck } from './hooks.js';
import { PHASE_CTA, displayNameOf, offerTypeOf } from './offer.js';

// Campaign phases relative to an event, as fractions of its lead time.
// Each phase carries the objective and the call-to-action style for content in it.
const PHASES = [
  { id: 'tease', objective: 'Build anticipation and grow the waitlist', cta: 'Join the waitlist / turn on notifications' },
  { id: 'warm-up', objective: 'Educate and show the offer\'s value', cta: 'Save this post / add to wishlist' },
  { id: 'early-access', objective: 'Reward subscribers and convert the warmest audience', cta: 'Get early access (link in bio / email)' },
  { id: 'launch', objective: 'Drive sales on the day', cta: 'Shop now' },
  { id: 'last-chance', objective: 'Convert people who waited', cta: 'Ends tonight. Shop now' },
  { id: 'thank-you', objective: 'Retain buyers and collect social proof', cta: 'Share your purchase / leave a review' },
];
const PHASE = Object.fromEntries(PHASES.map((p) => [p.id, p]));

const EVERGREEN_PILLARS = [
  { id: 'education', objective: 'Teach something useful in your niche', cta: 'Save for later' },
  { id: 'behind-the-scenes', objective: 'Show the people and process behind the brand', cta: 'Follow for more' },
  { id: 'social-proof', objective: 'Share a testimonial, review or customer result (with permission)', cta: 'See more reviews' },
  { id: 'community', objective: 'Start a conversation or answer FAQs', cta: 'Comment below' },
  { id: 'product-spotlight', objective: 'Feature one product or service in depth', cta: 'Learn more' },
];

const IMPACT_RANK = { high: 3, medium: 2, low: 1 };

// Default posting weekdays by frequency (0=Sun). Spread out, favouring Tue-Thu.
const DAY_SETS = {
  1: [3], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 6], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6],
};

function phaseFor(date, ev) {
  const lead = diffDays(date, ev.date);          // days before event start (positive = before)
  const sinceEnd = diffDays(ev.endDate, date);   // days after event end (positive = after)
  if (sinceEnd > 0 && sinceEnd <= 2) return 'thank-you';
  if (sinceEnd > 2) return null;
  if (lead <= 0) return date === ev.endDate && ev.durationDays > 1 ? 'last-chance' : 'launch';
  if (lead > ev.leadDays) return null;
  if (lead <= 2) return 'early-access';
  if (lead <= Math.ceil(ev.leadDays / 2)) return 'warm-up';
  return 'tease';
}

// Score how strongly a date belongs to an event's campaign; higher wins.
function score(phase, ev) {
  const phaseWeight = { launch: 6, 'last-chance': 5, 'early-access': 4, 'warm-up': 3, tease: 2, 'thank-you': 1 }[phase];
  // Relevance decides between campaigns; longer campaigns win ties.
  return IMPACT_RANK[ev.impact] * 10 + phaseWeight + (ev.relevance?.score ?? 0) / 10 + ev.leadDays / 1000;
}

// Suggested posting times in the audience's local time: a sensible start until a brand's own results say otherwise.
const POST_TIMES = { instagram: ['12:30', '19:00'], tiktok: ['19:00', '21:00'], facebook: ['13:00', '19:30'], whatsapp: ['08:00', '18:30'], linkedin: ['08:30', '12:00'], x: ['09:00', '18:00'], youtube: ['17:00', '19:00'], email: ['10:00', '17:00'], telegram: ['09:00', '19:00'], pinterest: ['14:00', '20:00'] };
const PHASE_TIME = { launch: 0, 'last-chance': 1 }; // a launch goes out early in the day; a last call goes out in the evening
export function postTimeFor(platform, date, phase, custom = {}) {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(custom?.[platform] ?? '')) return custom[platform];
  const t = POST_TIMES[platform] ?? ['10:00', '19:00'];
  if (phase in PHASE_TIME) return t[PHASE_TIME[phase]];
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (day === 0 || day === 6) return t[1]; // weekends: later in the day
  return t[Number(date.slice(8)) % 2];
}

/**
 * Build a content plan. Accepts loose input: platforms as "ig, tik tok and whatsapp",
 * regions as cities or countries, niche as free text ("i sell sneakers in lagos").
 * @param {object} o
 * @param {string} o.brand
 * @param {string} o.niche              free text, classified into a niche profile
 * @param {string} [o.nicheId]          force a niche profile id
 * @param {string} [o.product]
 * @param {string[]|string} o.platforms
 * @param {string[]|string} [o.regions]
 * @param {string} [o.startDate] default today
 * @param {string} [o.endDate] default 60 days after start
 * @param {number} [o.postsPerWeek] per platform, 1-7, default 4 (capped per platform)
 * @param {string[]} [o.focusEvents] event ids or names ("black friday", "xmas")
 * @param {string} [o.offer] written any way: "30 percent off", "N5k off", "BOGO"
 * @param {boolean} [o.sellsProducts] default true; false = awareness/content-only creators
 */
export function buildPlan(o) {
  const notes = [];
  const start = o.startDate ?? today();
  parse(start);
  const end = o.endDate ?? addDays(start, 60);
  if (end < start) throw new Error('endDate is before startDate');
  const perWeek = Math.min(7, Math.max(1, Math.round(o.postsPerWeek ?? 4)));

  const pf = normalizePlatforms(o.platforms?.length ? o.platforms : ['instagram', 'tiktok', 'email']);
  if (pf.unknown.length) notes.push(`Ignored unknown platforms: ${pf.unknown.join(', ')}.`);
  if (!pf.values.length) throw new Error(`Unknown platform "${[].concat(o.platforms).join(', ')}". Known: ${Object.keys(PLATFORMS).join(', ')}`);
  const platforms = pf.values;
  const rg = normalizeRegions(o.regions ?? []);
  if (rg.unknown.length) notes.push(`Ignored unknown regions: ${rg.unknown.join(', ')}.`);
  const regions = rg.values;
  const cls = classifyNiche(`${o.niche ?? ''} ${o.product ?? ''}`);
  const nicheId = NICHES[o.nicheId] ? o.nicheId : cls.id;
  const niche = NICHES[nicheId];
  // Never echo a whole sentence as the product name; fall back to the matched keyword.
  const product = o.product || (o.niche && o.niche.split(/\s+/).length <= 3 ? o.niche : cls.matched[0]) || 'our products';
  const offer = parseOffer(o.offer);
  const sellsProducts = o.sellsProducts ?? true;

  // Look ahead past the window so tease phases of events right after `end` are included.
  const all = listEvents({ from: addDays(start, -3), to: addDays(end, 40), regions, referenceDate: start, includePast: true })
    .map((e) => ({ ...e, relevance: relevance(e, regions, niche.eventFit) }))
    // Shipping deadlines only matter for physical goods.
    .filter((e) => shipsByPost(niche) || !SHIPPING_EVENTS.includes(e.id));
  const wanted = (o.focusEvents ?? []).flatMap((f) => (all.some((e) => e.id === f) ? [f] : findEventsInText(f)));
  let focus;
  if (wanted.length) {
    focus = all.filter((e) => wanted.includes(e.id));
  } else {
    // Rank by relevance to this audience and niche, keep the strongest campaigns.
    // Room for roughly one campaign a week, never fewer than six.
    const maxCampaigns = Math.max(6, Math.ceil((diffDays(start, end) / 7) * 1.2));
    focus = all.filter((e) => e.relevance.score >= 1.5).sort((a, b) => b.relevance.score - a.relevance.score).slice(0, maxCampaigns);
    const skipped = all.filter((e) => e.impact === 'high' && e.relevance.score < 1.5 && e.date >= start && e.date <= end);
    if (skipped.length) notes.push(`Left out as low relevance for this audience and niche: ${skipped.map((e) => e.name).join(', ')}. Add them with focusEvents if they matter to you.`);
  }
  if (sellsProducts) focus = focus.filter((e) => e.salesAppropriate || wanted.includes(e.id));
  const observances = all.filter((e) => !e.salesAppropriate && e.date >= start && e.date <= end && e.relevance.score > 0);

  // One deck per plan: no hook is used twice in the same calendar.
  const offerType = o.offerType ?? offerTypeOf(nicheId, `${o.niche ?? ''} ${o.product ?? ''}`);
  const deck = hookDeck({ nicheHooks: niche.hooks, product: displayNameOf({ brand: o.brand ?? 'us', displayName: o.displayName }, product), discount: offer?.type === 'percent' ? `${offer.value}%` : null, brand: o.brand ?? 'us', offerType });
  // Best sellers (from sales stats or the seller) are featured in selling posts, top seller most often.
  const featured = (o.featured ?? []).filter(Boolean).slice(0, 5);
  const weights = featured.flatMap((name, i) => Array(Math.max(1, 3 - i)).fill(name));
  let featureIdx = 0;
  const feature = () => (weights.length ? weights[featureIdx++ % weights.length] : undefined);
  const slots = [];
  const weekCount = {};
  let pillarIdx = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const live = focus
      .map((ev) => ({ ev, phase: phaseFor(d, ev) }))
      .filter((x) => x.phase)
      .sort((a, b) => score(b.phase, b.ev) - score(a.phase, a.ev));
    const top = live[0];
    // Always post on launch / last-chance days, even if not a regular posting day.
    const mustPost = top && (top.phase === 'launch' || top.phase === 'last-chance');
    const observance = observances.find((e) => e.date === d);
    const week = Math.floor(diffDays(start, d) / 7);

    platforms.forEach((platformId, pi) => {
      const p = PLATFORMS[platformId];
      // Each platform has its own sustainable cadence (email and WhatsApp far lower than TikTok).
      const cap = Math.min(perWeek, p.cadencePerWeek ?? 7);
      const regular = DAY_SETS[cap].includes(weekday(d));
      const keySend = mustPost || (top?.phase === 'early-access' && (platformId === 'email' || platformId === 'whatsapp'));
      const key = `${platformId}:${week}`;
      if (!regular && !keySend && !observance) return;
      // Social posts always go out on launch days. Inbox channels (email, WhatsApp) may exceed
      // their cadence by one send in a sale week, never more, to avoid unsubscribes.
      const inbox = platformId === 'email' || platformId === 'whatsapp';
      if ((weekCount[key] ?? 0) >= (keySend ? (inbox ? cap + 1 : Infinity) : cap)) return;
      weekCount[key] = (weekCount[key] ?? 0) + 1;

      const formatIds = Object.keys(p.formats).filter((f) => !['thumbnail', 'event-cover', 'catalog'].includes(f));
      const format = formatIds[(slots.length + pi) % formatIds.length];
      let slot;
      if (observance && !mustPost) {
        slot = { kind: 'observance', event: observance.name, eventId: observance.id, phase: 'observance',
          objective: 'Respectful acknowledgement; no promotion', cta: 'None', angle: observance.angles[0] };
      } else if (top) {
        const ph = PHASE[top.phase];
        const angles = phaseAngles(nicheId, top.phase, product);
        const angle = angles.length ? angles[(slots.length + pi) % angles.length] : top.ev.angles[0];
        slot = { kind: 'campaign', event: top.ev.name, eventId: top.ev.id, eventDate: top.ev.date, phase: top.phase,
          objective: ph.objective, cta: sellsProducts ? (PHASE_CTA[offerType]?.[top.phase] ?? ph.cta) : 'Save / share / follow', angle,
          hook: deck.next(top.phase, top.ev.name),
          ...(featured.length && ['warm-up', 'early-access', 'launch', 'last-chance'].includes(top.phase) ? { feature: feature() } : {}),
          hashtags: top.ev.hashtags.slice(0, 3),
          ...(observance ? { caution: `Also ${observance.name}: keep the tone respectful and leave remembrance imagery out of sales content.` } : {}) };
      } else {
        const pillar = EVERGREEN_PILLARS[pillarIdx++ % EVERGREEN_PILLARS.length];
        slot = { kind: 'evergreen', phase: pillar.id, objective: pillar.objective, cta: pillar.cta,
          angle: `${pillar.id.replace(/-/g, ' ')}: ${niche.label.toLowerCase()}`, hook: deck.next('evergreen') };
      }
      const f = p.formats[format];
      const isMotion = /reel|video|short|story|status/.test(format);
      slots.push({ date: d, time: postTimeFor(platformId, d, slot.phase, o.postTimes), weekday: weekdayName(d), platform: platformId, format, size: f.size ?? null, aspect: f.aspect ?? null, ...slot,
        ...(isMotion ? { shot: niche.shots[(slots.length + pi) % niche.shots.length] } : {}), status: 'idea' });
    });
  }

  const eventsCovered = focus
    .filter((e) => e.date <= addDays(end, 40) && slots.some((s) => s.eventId === e.id))
    .map((e) => ({ id: e.id, name: e.name, date: e.date, promoStart: e.promoStart, impact: e.impact, why: e.relevance.reasons }));

  return {
    brand: o.brand,
    niche: { id: nicheId, label: niche.label, kind: niche.kind },
    product, offer, offerType,
    interpreted: { platforms, regions, niche: niche.label, notes },
    timesNote: 'Posting times are suggestions in your audience\'s local time. Change them to suit you, and let your results guide you.',
    ...(featured.length ? { featured } : {}),
    window: { start, end },
    postsPerWeekPerPlatform: perWeek,
    cadence: Object.fromEntries(platforms.map((p) => [p, `${Math.min(perWeek, PLATFORMS[p].cadencePerWeek ?? 7)}/week + key sale days`])),
    platforms,
    eventsCovered,
    observances: observances.map((e) => ({ name: e.name, date: e.date, guidance: 'No sales tie-ins' })),
    totals: {
      slots: slots.length,
      campaign: slots.filter((s) => s.kind === 'campaign').length,
      evergreen: slots.filter((s) => s.kind === 'evergreen').length,
    },
    phaseGuide: PHASES,
    compliance: niche.compliance,
    slots,
    nextSteps: [
      'Write each slot: start from its hook, and use asset_brief for specs and shots.',
      'Build a landing page for the main offer with landing_page.',
      'Export to your calendar or Notion with export_plan.',
    ],
  };
}
