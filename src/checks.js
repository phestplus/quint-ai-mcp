// render_check v1: Quint AI checks its own output before anyone sees it. Every rule here comes from a
// real complaint (see the field log): leaked markup, retail copy for non-retail offers, raw inputs as
// headings, prices without an offer, words the brand avoids, unrequested locations, off-brand palettes.
// Issues are returned with the tool result and, when connected, filed automatically for the team.

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** Visible text of an HTML document (no styles, scripts or tags), entities decoded once. */
export function visibleText(html = '') {
  return decode(String(html)
    .replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

const RETAIL = /\b(add to (cart|bag)|in your cart|wishlist|shop now|shop the sale|in stock|reply to this message to order|order now|doorbuster)\b/i;
const PLACEHOLDER = /\[(describe[^\]]*|line|≤\s*\d+ words|insert[^\]]*|your [^\]]*)\]|\blorem ipsum\b|\bTBD\b|\buse [^.]{2,40} instead\b/i;
const MONEY = /(₦|\$|€|£|¥|₹|\bNGN\b|\bUSD\b|\bKES\b|\bGHS\b|\bZAR\b)\s?\d[\d,.]*/;
const esc = (w) => String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {object} c
 * @param {'page'|'kit'} c.kind
 * @param {string} c.html            the rendered output
 * @param {object} c.args            the tool arguments that produced it
 * @param {object[]} [c.posts]       kit posts (hooks and captions)
 * @param {boolean} [c.contentOnly]  true when no offer was given
 * @returns {{ passed: boolean, issues: { rule: string, severity: 'error'|'warn', message: string, sample?: string }[] }}
 */
export function checkOutput({ kind, html, args = {}, posts = [], contentOnly = false }) {
  const issues = [];
  const add = (rule, severity, message, sample) => issues.push({ rule, severity, message, ...(sample ? { sample: String(sample).slice(0, 160) } : {}) });
  const text = visibleText(html);
  const captions = posts.flatMap((p) => [p.hook ?? '', ...Object.values(p.caption ?? {})]).join(' \n ');
  const all = `${text} \n ${captions}`;
  const around = (re, s = all) => { const m = re.exec(s); return m ? s.slice(Math.max(0, m.index - 40), m.index + 60) : ''; };

  // Markup
  const leak = /data-[a-z-]+=|\bvw"|<\/?[a-z]+[\s>]/i;
  if (leak.test(text)) add('markup.leak', 'error', 'Markup is visible as text on the page.', around(leak, text));
  if (/&(amp|lt|gt|quot|#39);/.test(text)) add('markup.entity', 'error', 'An HTML entity is shown as text (double-escaped).', around(/&(amp|lt|gt|quot|#39);/, text));
  if (/\b(undefined|NaN)\b|\[object Object\]/.test(all)) add('markup.undefined', 'error', 'An empty value ("undefined", "NaN") reached the output.', around(/\b(undefined|NaN)\b|\[object Object\]/));

  // Copy
  const offerType = args.offerType;
  if (offerType && offerType !== 'physical' && RETAIL.test(all)) add('copy.retail_in_nonphysical', 'error', `Retail wording for a ${offerType} offer.`, around(RETAIL));
  if (PLACEHOLDER.test(all)) add('copy.placeholder', 'error', 'A placeholder or instruction was left in the copy.', around(PLACEHOLDER));
  const raw = String(args.product ?? '').trim();
  if (raw.split(/\s+/).length > 3) {
    const headings = [...String(html).matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => visibleText(m[1]));
    const hit = headings.find((h) => h.toLowerCase().includes(raw.toLowerCase()));
    if (hit) add('copy.raw_product_heading', 'warn', 'The raw product description is used as a heading; pass a short displayName.', hit);
  }
  if (args.brand) {
    const eyebrows = [...String(html).matchAll(/class="(?:ey|eyebrow)[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => visibleText(m[1]));
    const b = new RegExp(esc(args.brand), 'gi');
    const twice = eyebrows.find((e) => (e.match(b) ?? []).length > 1);
    if (twice) add('copy.brand_repeated', 'warn', 'The brand name is repeated in a label.', twice);
  }

  // Pricing
  if (contentOnly) {
    if (MONEY.test(text)) add('pricing.no_offer_price', 'error', 'A price is shown although there is no offer.', around(MONEY, text));
    if (/limited-time offer|\d+\s?% off|sale price/i.test(all)) add('pricing.no_offer_badge', 'error', 'Offer wording is shown although there is no offer.', around(/limited-time offer|\d+\s?% off|sale price/i));
  }

  // Positioning
  const avoid = [...(args.avoidWords ?? []), ...(args.positioning?.isNot ?? [])].filter(Boolean);
  for (const w of avoid) {
    const re = new RegExp(`(^|[^a-z])${esc(String(w).toLowerCase())}`, 'i');
    if (re.test(all)) add('positioning.avoid_word', 'error', `Uses "${w}", which the brand avoids.`, around(re));
  }
  const LOC = /\b[Mm]ade in [A-Z][a-z]+/;
  if (args.noLocationMentions !== false && LOC.test(all)) add('positioning.location', 'warn', 'Mentions a location the seller did not ask for.', around(LOC));

  // Brand look
  const bg = args.brandStyle?.palette?.bg ?? args.palette?.bg;
  if (bg && kind === 'page' && !new RegExp(`--bg:${esc(bg)}`, 'i').test(html)) add('brand.palette', 'error', 'The brand background colour was not applied.', bg);

  // Consistency
  if (args.deadline && /Z$/.test(String(args.deadline)) && args.timeZone && args.timeZone !== 'UTC') add('consistency.deadline_utc', 'warn', 'The deadline is in UTC but the campaign has a local time zone; it may end an hour or more early or late.', args.deadline);

  return { passed: !issues.some((i) => i.severity === 'error'), issues };
}
