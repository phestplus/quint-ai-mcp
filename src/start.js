// q4_start: the context engine. Takes whatever the user typed ("i sell sneakers in
// lagos, need bf content for ig and whatsapp, 30 percent off") and returns what we
// understood, what we assumed, the few questions that truly block progress, the
// events that matter for this audience, what to post today, and prefilled next calls.
import { listEvents, relevance } from './calendar.js';
import { addDays, today } from './dates.js';
import { classifyNiche, NICHES, phaseAngles, SHIPPING_EVENTS, shipsByPost } from './niches.js';
import { currencyFor, findCountriesInText, findEventsInText, findPlatformsInText, findRegionInText, normalizePlatforms, normalizeRegions, parseLooseDate, parseOffer } from './normalize.js';

const THEME_BY_EVENT = { 'black-friday': 'black-friday', 'cyber-monday': 'cyber-monday', christmas: 'christmas', 'christmas-eve': 'christmas', 'super-saturday': 'christmas', 'shipping-cutoff': 'christmas', diwali: 'diwali', dhanteras: 'diwali', hanukkah: 'hanukkah', halloween: 'halloween', 'us-thanksgiving': 'thanksgiving', 'boxing-day': 'boxing-day', 'new-year': 'new-year', 'new-years-eve': 'new-year' };

// Standard UTC offsets for common markets, so an "ends Nov 27" deadline means 23:59 local time.
const OFFSETS = { NG: '+01:00', GH: '+00:00', KE: '+03:00', ZA: '+02:00', EG: '+02:00', MA: '+01:00', CM: '+01:00', SN: '+00:00', CI: '+00:00', UG: '+03:00', TZ: '+03:00', RW: '+02:00', ET: '+03:00',
  GB: '+00:00', IE: '+00:00', FR: '+01:00', DE: '+01:00', ES: '+01:00', IT: '+01:00', NL: '+01:00', AE: '+04:00', SA: '+03:00', QA: '+03:00', KW: '+03:00', IN: '+05:30', PK: '+05:00', BD: '+06:00',
  SG: '+08:00', MY: '+08:00', PH: '+08:00', ID: '+07:00', CN: '+08:00', JP: '+09:00', AU: '+10:00', NZ: '+12:00', US: '-05:00', CA: '-05:00', MX: '-06:00', BR: '-03:00', JM: '-05:00', TT: '-04:00' };
function offsetFor(regions = [], countries = []) {
  const code = [...countries, ...regions].map((c) => String(c?.code ?? c).toUpperCase()).find((c) => OFFSETS[c]);
  return OFFSETS[code] ?? 'Z';
}

export const MOOD_QUERIES = {
  footwear: ['sneakers on concrete', 'street style shoes close up', 'urban night city lights'],
  fashion: ['fashion editorial model', 'runway fabric movement', 'boutique interior warm light'],
  beauty: ['skincare texture close up', 'cosmetics flat lay neutral', 'bathroom shelf natural light'],
  jewelry: ['gold jewelry macro', 'luxury gift box ribbon', 'velvet background sparkle'],
  electronics: ['tech desk setup dark', 'headphones studio light', 'gadget minimal background'],
  automotive: ['car headlights night road', 'open road sunset drive', 'luxury car interior'],
  home: ['cozy living room evening', 'interior design minimal', 'holiday table setting'],
  food: ['holiday food table', 'pastries close up', 'restaurant warm light'],
  fitness: ['gym training dramatic light', 'running sunrise city', 'yoga studio calm'],
  courses: ['person studying laptop night', 'notebook desk coffee', 'creative workspace'],
  apps: ['person smiling at phone home', 'couple using phone together', 'phone in hand warm light'],
  software: ['abstract technology light', 'laptop dark desk', 'minimal workspace'],
  digital: ['creative workspace screens', 'designer desk', 'abstract gradient light'],
  services: ['salon interior', 'professional at work', 'calm studio space'],
  kids: ['children playing toys', 'christmas morning gifts', 'colorful playroom'],
  general: ['holiday shopping bags', 'gift boxes festive', 'city lights night'],
};

/**
 * @param {object} o
 * @param {string} o.description  anything the user wrote
 * @param {string} [o.brand] [o.product] [o.offer] [o.deadline]
 * @param {string[]|string} [o.platforms] [o.regions]
 * @param {string} [o.today]       for testing
 */
export function startCampaign(o) {
  const text = [o.description, o.product, o.offer].filter(Boolean).join(' ');
  const now = o.today ?? today();
  const year = Number(now.slice(0, 4));
  const assumptions = [];
  const questions = [];

  // Niche and product
  const cls = classifyNiche(`${o.description ?? ''} ${o.product ?? ''}`);
  const niche = NICHES[cls.id];
  const product = o.product || cls.matched[0] || null;
  // Blocks only when Quint AI cannot tell at all; a reasonable guess proceeds and says what it assumed.
  if (cls.confidence !== 'high') questions.push({ field: 'product', question: `What exactly do you sell, and how do people buy it? (a product they order, an app or subscription, a course, a booked service)`, blocking: cls.confidence === 'low', defaultUsed: `${NICHES[cls.id]?.label ?? 'general'} (a guess; the plan, posts and page depend on this)` });

  // Platforms
  let platforms = o.platforms ? normalizePlatforms(o.platforms).values : findPlatformsInText(text);
  // Regions
  const placeInfo = o.regions ? normalizeRegions(o.regions) : null;
  let regions = placeInfo ? placeInfo.values : findRegionInText(text);
  const countries = placeInfo ? placeInfo.countries : findCountriesInText(text);
  if (!regions.length && !countries.length) { assumptions.push('No location given, so events are ranked for a worldwide online audience.'); questions.push({ field: 'location', question: 'Where are most of your customers? (country or city)', blocking: false, defaultUsed: 'worldwide' }); }
  if (!platforms.length) {
    platforms = ['instagram', 'tiktok', ...(regions.includes('NG') || regions.includes('IN') ? ['whatsapp'] : []), 'email'];
    assumptions.push(`No platforms given, so the plan uses ${platforms.join(', ')}. Change them any time.`);
  }

  // Offer and deadline
  const offer = parseOffer(o.offer ?? (/(\d{1,2}\s*(%|percent)|bogo|buy\s*(one|1)\s*get|free\s*(shipping|delivery)|[$£€₦]\s?[\d,]+k?\s*off)/i.exec(text)?.[0] ?? null));
  if (!offer) questions.push({ field: 'offer', question: 'What is the offer? (e.g. 30% off everything, free delivery, buy 1 get 1). Say "no discount" if you only want content.', blocking: false, defaultUsed: 'content campaign without a discount' });

  // Events: the ones the user named, else the most relevant upcoming ones.
  const mentioned = findEventsInText(text);
  const upcoming = listEvents({ from: now, to: `${year + 1}-01-01`, regions, referenceDate: now })
    .map((e) => ({ ...e, relevance: relevance(e, regions, niche.eventFit) }))
    .filter((e) => e.salesAppropriate)
    // Shipping deadlines only matter for physical goods.
    .filter((e) => shipsByPost(niche) || !SHIPPING_EVENTS.includes(e.id));
  // "december deals", "november sale": honour the month the user named.
  const monthNamed = ['october', 'november', 'december'].findIndex((m) => new RegExp(String.raw`\b(${m}|${m.slice(0, 3)})\b(?!\s*\d)`, 'i').test(text));
  const inMonth = (e) => monthNamed < 0 || Number(e.date.slice(5, 7)) === 10 + monthNamed;
  let events = mentioned.length ? upcoming.filter((e) => mentioned.includes(e.id)) : [];
  const recommended = upcoming.filter((e) => e.relevance.score >= 1.5 && !events.includes(e) && inMonth(e)).sort((a, b) => b.relevance.score - a.relevance.score).slice(0, Math.max(0, 4 - events.length));
  events = [...events, ...recommended].sort((a, b) => (a.date < b.date ? -1 : 1));
  // Main campaign: the event the user named, else the most relevant high-impact one.
  const main = events.find((e) => mentioned.includes(e.id)) ?? [...events].filter((e) => e.impact === 'high').sort((a, b) => b.relevance.score - a.relevance.score)[0] ?? events[0];

  const deadlineText = o.deadline ?? /\b(?:ends?|ending|until|till|through|thru|by|expires?)\s+(?:on\s+)?([a-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?[a-z]{3,9}|\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?)/i.exec(text)?.[1]?.replace(/\bof\s+/i, '').replace('.', '');
  const deadline = deadlineText
    ? parseLooseDate(deadlineText, { year, regions, resolveEvent: (id) => upcoming.find((e) => e.id === id)?.endDate })
    : main ? main.endDate : null;
  if (!deadlineText && main) assumptions.push(`Offer assumed to end on ${main.name} (${main.endDate}). Tell me if it runs longer.`);

  // What to post today for the main campaign.
  const lead = main ? Math.round((Date.parse(main.date) - Date.parse(now)) / 86400000) : null;
  const phaseNow = !main ? null : lead <= 0 ? 'launch' : lead <= 2 ? 'early-access' : lead <= Math.ceil(main.leadDays / 2) ? 'warm-up' : lead <= main.leadDays ? 'tease' : 'not yet';
  const urgency = main ? (lead <= 0 ? `${main.name} is live today.` : lead <= main.leadDays ? `${main.name} is in ${lead} days. You are in the ${phaseNow} phase: post now.` : `${main.name} is in ${lead} days. Start teasing on ${main.promoStart}.`) : null;

  const brand = o.brand ?? null;
  if (!brand) questions.push({ field: 'brand', question: 'What is your brand or shop name?', blocking: false, defaultUsed: 'placeholder brand; needed before publishing a page' });

  const theme = main ? THEME_BY_EVENT[main.id] ?? 'default' : 'default';
  const planArgs = { brand: brand ?? '<brand>', niche: o.description ?? product ?? niche.label, ...(product ? { product } : {}), platforms, regions, startDate: now, endDate: main ? addDays(main.endDate, 3) : undefined, ...(offer ? { offer: offer.text } : {}), ...(mentioned.length ? { focusEvents: mentioned } : {}) };

  return {
    understood: {
      brand, product, niche: { id: cls.id, label: niche.label, kind: niche.kind, confidence: cls.confidence },
      platforms, regions, countries, currency: currencyFor(regions), offer, deadline,
    },
    assumptions,
    // Never blocking: ask these in one message and keep working with the defaults.
    questions: ['product', 'offer', 'brand', 'location'].map((f) => questions.find((q) => q.field === f)).filter(Boolean).slice(0, 3),
    canProceed: !questions.some((x) => x.blocking),
    mainEvent: main ? { id: main.id, name: main.name, date: main.date, daysUntil: lead, promoStart: main.promoStart, phaseNow } : null,
    urgency,
    events: events.map((e) => ({ id: e.id, name: e.name, date: e.date, daysUntil: e.daysUntil, promoStart: e.promoStart, why: e.relevance.reasons })),
    postIdeasNow: !main ? [] : phaseNow === 'not yet'
      ? { when: `Prepare now, publish from ${main.promoStart}`, ideas: phaseAngles(cls.id, 'tease', product ?? 'your product'), meanwhile: 'Until then: grow your email or WhatsApp list and post evergreen content so the audience is warm.' }
      : { when: 'Publish now', ideas: phaseAngles(cls.id, phaseNow, product ?? 'your product') },
    compliance: niche.compliance,
    landing: { direction: niche.archetype, theme, imageQueries: MOOD_QUERIES[cls.id] ?? MOOD_QUERIES.general },
    nextCalls: [
      { tool: 'content_plan', args: planArgs },
      { tool: 'find_images', args: { query: (MOOD_QUERIES[cls.id] ?? MOOD_QUERIES.general)[0], orientation: 'landscape' } },
      { tool: 'landing_page', args: { brand: brand ?? '<brand>', ...(product ? { product } : {}), theme, ...(offer?.type === 'percent' ? { discountPercent: offer.value } : offer ? { offer: offer.text } : {}), ...(deadline ? { deadline: `${deadline}T23:59:00${offsetFor(regions, countries)}` } : {}) } },
    ],
  };
}
