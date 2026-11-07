// Content kit: ready-to-post graphics with captions on one review page.
// Every graphic is built at its real platform size in HTML/CSS, previewed scaled down, and exported
// to PNG in the browser (html-to-image). No auto-posting: the page offers the phone's share sheet
// (Instagram, TikTok, WhatsApp with the image attached), share links, copy caption and download.
import { THEMES, readableOn, discountOf } from './landing.js';
import { classifyNiche, NICHES } from './niches.js';
import { hookDeck } from './hooks.js';
import { captionsFor } from './captions.js';
import { brandTheme, brandTokens, hasBrandLook, wordmarkHtml } from './brand.js';
import { VERBS, displayNameOf, offerTypeOf } from './offer.js';
import { MOTIF_CSS, motifFor } from './motifs.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const hex = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null);

export const KIT_FORMATS = {
  post: { w: 1080, h: 1350, label: 'Instagram / Facebook post (4:5)', platforms: ['instagram', 'facebook'] },
  square: { w: 1080, h: 1080, label: 'Square post (1:1)', platforms: ['instagram', 'facebook', 'linkedin'] },
  story: { w: 1080, h: 1920, label: 'Story, Status, Reels cover (9:16)', platforms: ['instagram', 'whatsapp', 'tiktok'] },
  wide: { w: 1600, h: 900, label: 'X / LinkedIn (16:9)', platforms: ['x', 'linkedin'] },
};

function deadlineText(deadline, timeZone) {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  return `Ends ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: timeZone || 'UTC' })}`;
}

/**
 * @param {object} o { brand, product, niche, theme, offer, discountPercent, price, originalPrice, deadline, timeZone,
 *   ctaUrl, pageUrl, products: [{name, price, originalPrice, image}], images: [{url, alt, credit}], logoUrl, brandColor,
 *   posts: [{format, headline, sub, caption, image}] (optional overrides written by the AI), watermark, proxy }
 * @returns {{ html: string, posts: object[], images: string[] }}
 */
export function buildKit(o) {
  if (!o.brand) throw new Error('Send "brand".');
  const nicheId = NICHES[o.nicheId] ? o.nicheId : classifyNiche(`${o.niche ?? ''} ${o.product ?? ''}`).id;
  const niche = NICHES[nicheId];
  const rawProduct = o.product || 'our products';
  const offerType = o.offerType ?? offerTypeOf(nicheId, `${o.niche ?? ''} ${o.product ?? ''}`);
  const product = displayNameOf(o, rawProduct);
  let t = { ...(THEMES[o.theme] ?? THEMES.default) };
  if (hasBrandLook(brandTokens(o))) t = brandTheme(t, brandTokens(o));
  const brandColor = hex(o.brandColor);
  if (brandColor) { t.accent = brandColor; t.accentText = readableOn(brandColor); }
  // Content-only mode: no offer means no sale posts, no prices, no stickers and no offer badge.
  const noOffer = o.mode === 'content' || /^\s*(none|no|no offer|no discount)\s*$/i.test(String(o.offer ?? ''));
  const off = noOffer ? null : discountOf(o);
  const hasOffer = !noOffer && Boolean(off || (o.offer && /\S/.test(o.offer)) || (o.price && o.originalPrice));
  const contentOnly = !hasOffer;
  const offTxt = off ? `${off}% off` : null;
  const ends = hasOffer ? deadlineText(o.deadline, o.timeZone) : null;
  // The event label comes from a real event theme only (never "Limited-time offer" from the default).
  const event = THEMES[o.theme] && o.theme !== 'default' ? t.eyebrow : null;
  const link = o.pageUrl || o.ctaUrl || '';
  const deck = hookDeck({ nicheHooks: niche.hooks, product, discount: off ? `${off}%` : null, brand: o.brand, seed: o.brand.length, offerType, avoid: [...(o.avoidWords ?? []), ...(o.positioning?.isNot ?? [])] });
  // Without an offer, saved prices are never shown (they may not be live yet).
  const products = (o.products ?? []).filter((p) => p?.name).slice(0, 6).map((p) => (hasOffer ? p : { ...p, price: undefined, originalPrice: undefined }));
  const photos = (o.images ?? []).filter((im) => im?.url);
  const imgs = [];
  const img = (url) => { if (!url) return null; if (!imgs.includes(url)) imgs.push(url); return o.proxy ? o.proxy(url, imgs.indexOf(url)) : url; };
  // Hashtags only from short names: a squashed product phrase (#BrandPremiumandFamilyyearlyplans) reads as spam.
  const tag = (t) => { const h = String(t ?? '').replace(/[^a-z0-9]/gi, ''); return h.length > 2 && h.length <= 20 ? `#${h}` : null; };
  const tags = [tag(o.brand), event ? tag(event) : null, o.product && product.split(/\s+/).length <= 2 ? tag(product) : null].filter(Boolean);

  const isWhatsApp = /wa\.me|whatsapp/i.test(link);
  const caps = (hook, kind, items, apps) => { const all = captionsFor({ hook, brand: o.brand, product, event, offTxt, ends, link, isWhatsApp, items, tags, kind, offerType }); return Object.fromEntries(apps.map((k) => [k, all[k]])); };


  // Posts: offer, product spotlights, carousel, story, last call, wide card. AI overrides win.
  const posts = [];
  // Truth rule: a product is only ever shown with the seller's own photo of it. Without one the
  // graphic waits for an upload (Share/Download stay off). Mood posts use matched real photos or type.
  const pIdx = (p) => products.indexOf(p);
  // JPEG/WebP photos fill their area; SVG and PNG (illustrations, cut-outs) are laid out frameless.
  const isArt = (u) => /\.svg(\?|$)|\.png(\?|$)|^data:image\/(svg|png)/i.test(String(u));
  const photo = (url, alt, cls, key, representative = false) => `<div class="ph ${cls}${representative ? ' rep' : ''}${isArt(url) ? ' art' : ' photo'}" data-p="${key}"><img src="${esc(img(url))}" alt="${esc(alt ?? product)}" crossorigin="anonymous" onerror="this.parentNode.classList.add('need');this.remove()"><span class="need-l">Add a photo</span>${representative ? '<span class="rep-l">Representative image</span>' : ''}</div>`;
  const need = (p, cls) => `<div class="np ${cls}" aria-hidden="true"><span>${esc(p.name)}</span></div>`;
  const bigWord = off ? `${off}%` : (product.split(' ').pop() || o.brand);
  // Condensed display faces run about 0.5em per character; size the statement to the frame width.
  const typo = (cls, frameW) => `<div class="ty ${cls}" aria-hidden="true" style="font-size:${Math.min(560, Math.floor(frameW / (bigWord.length * 0.52)))}px"><span>${esc(bigWord)}</span>${off ? '<em>off</em>' : ''}</div>`;
  const typeLed = !photos.length;
  let moodN = 0;
  const visual = (p, cls = '', frameW = 936) => (p ? (p.image ? photo(p.image, p.name, cls, pIdx(p), p.representative) : need(p, cls)) : photos.length ? photo(photos[moodN % photos.length].url, photos[moodN++ % photos.length].alt, cls, `m${moodN}`) : typo(cls, frameW));
  const priceRow = hasOffer && o.price ? `<p class="g-pr"><b>${esc(o.price)}</b>${o.originalPrice ? `<s>${esc(o.originalPrice)}</s>` : ''}</p>` : '';
  // With a photo, the photo is the focal point and the offer is the headline. Without one, the offer
  // itself is the focal point, so the headline is not repeated: price and end date support it.
  const offerHead = (fallback, own) => (own ? `<h2 class="g-h">${esc(own)}</h2>` : typeLed && off ? '' : `<h2 class="g-h">${esc(offTxt ? cap(offTxt) : fallback)}</h2>`);
  const head = (h) => `${deco}<div class="g-top"><span class="g-brand">${o.logoUrl ? `<img src="${esc(img(o.logoUrl))}" alt="">` : wordmarkHtml(o)}</span>${event ? `<span class="g-ev">${esc(event)}</span>` : ''}</div>${h}`;
  const wm = '<div class="q4wm">Made with Quint AI</div>';
  const verbs = VERBS[offerType] ?? VERBS.physical;
  // Motif by category (relationships: joining lines; food: steam; fitness: motion lines...), stable per brand.
  const deco = motifFor(nicheId, o.brand, o.illustration?.motifs ?? o.motifs).svg;
  const ICON = {
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" style="fill:none;stroke:currentColor;stroke-width:2"/><path d="M12 7v5l3 2" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" style="fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round"/></svg>',
  };
  const endsChip = ends ? `<p class="g-chip">${ICON.clock}<span>${esc(ends)}</span></p>` : `<p class="g-cta">${esc(verbs.cta)}</p>`;
  const feats = (list) => (list?.length ? `<ul class="g-feats">${list.slice(0, 3).map((f) => `<li>${ICON.check}<span>${esc(String(f).slice(0, 40))}</span></li>`).join('')}</ul>` : '');
  const sticker = (pct) => (pct ? `<div class="g-stk"><b>-${pct}%</b></div>` : '');
  const pctOf = (it) => { const n = (v) => Number(String(v ?? '').replace(/[^0-9.]/g, '')); const a = n(it.price), b = n(it.originalPrice); return a && b > a ? Math.round((1 - a / b) * 100) : null; };

  // AI overrides by slot id: hook/headline (drawn on the graphic too), title, format, image, caption, remove.
  const byId = Object.fromEntries((o.posts ?? []).filter((x) => x.id).map((x) => [x.id, x]));
  const removed = new Set([...(o.remove ?? []), ...(o.posts ?? []).filter((x) => x.remove).map((x) => x.id)]);
  const ov = (id) => byId[id] ?? {};
  const own = (id) => ov(id).hook ?? ov(id).headline;
  const fmtOf = (id, def) => (KIT_FORMATS[ov(id).format] ? ov(id).format : def);
  const add = (id, def, build) => {
    if (removed.has(id)) return;
    const o2 = ov(id);
    const hook = own(id) ?? def.hook;
    const post = build(hook, fmtOf(id, def.format));
    posts.push({ id, title: o2.title ?? def.title, format: fmtOf(id, def.format), hook, ...post });
  };

  if (hasOffer) {
    add('offer', { format: 'post', title: 'Offer announcement', hook: deck.next('launch', event) }, (h) => ({
      html: head(`<div class="g-mid">${visual(null, 'big', 936)}</div><div class="g-bot">${offerHead(h, own('offer'))}${priceRow}${feats(o.features)}${endsChip}</div>`),
      caption: caps(h, 'offer', o.price ? [{ name: product, price: o.price, originalPrice: o.originalPrice }] : products, ['instagram', 'whatsapp', 'x']) }));
  }

  products.slice(0, 3).forEach((p, i) => {
    const id = `product-${i + 1}`;
    add(id, { format: 'square', title: hasOffer ? `Spotlight: ${p.name}` : p.name, hook: deck.next(hasOffer ? 'launch' : 'evergreen', event) }, (h) => ({
      html: head(`${hasOffer && p.image ? sticker(pctOf(p)) : ''}<div class="g-mid">${visual(p)}</div><div class="g-bot"><h2 class="g-h sm">${esc(own(id) ?? p.name)}</h2>${hasOffer && p.price ? `<p class="g-pr"><b>${esc(p.price)}</b>${p.originalPrice ? `<s>${esc(p.originalPrice)}</s>` : ''}</p>` : ''}${p.note ? feats([p.note]) : ''}</div>`),
      caption: caps(h, hasOffer ? 'product' : 'content', [p], ['instagram', 'whatsapp', 'x']) }));
  });

  if (products.length >= 2) {
    add('carousel', { format: 'post', title: 'Carousel', hook: deck.next(hasOffer ? 'warm-up' : 'evergreen', event) }, (h) => ({
      slides: [
        head(`<div class="g-mid"><h2 class="g-h xl">${esc(h)}</h2></div><div class="g-bot"><p class="g-cta">Swipe →</p></div>`),
        ...products.slice(0, 4).map((p, i) => head(`<div class="g-mid">${visual(p)}</div><div class="g-bot"><p class="g-n">${String(i + 1).padStart(2, '0')}</p><h2 class="g-h sm">${esc(p.name)}</h2>${hasOffer && p.price ? `<p class="g-pr"><b>${esc(p.price)}</b>${p.originalPrice ? `<s>${esc(p.originalPrice)}</s>` : ''}</p>` : ''}</div>`)),
        head(`<div class="g-mid"><h2 class="g-h xl">${esc(offTxt ? `${cap(offTxt)}. ${ends ?? ''}`.trim() : 'Which one is for you?')}</h2></div><div class="g-bot"><p class="g-cta">${esc(link ? 'Link in bio' : 'Send us a message')}</p></div>`),
      ],
      caption: caps(h, hasOffer ? 'list' : 'content', products, ['instagram', 'whatsapp']) }));
  }

  if (hasOffer) {
    add('story', { format: 'story', title: 'Story / WhatsApp Status', hook: deck.next('launch', event) }, (h) => ({
      html: head(`<div class="g-mid">${visual(null, 'big', 936)}</div><div class="g-bot">${offerHead(h, own('story'))}${priceRow}${feats(o.features)}<p class="g-pill">${esc(link && /wa\.me/.test(link) ? (offerType === 'physical' ? 'Tap to order on WhatsApp' : 'Tap to message us on WhatsApp') : `Tap the link to ${verbs.cta.replace(/ now$/i, '').toLowerCase()}`)}</p></div>`),
      caption: caps(h, 'offer', products.length ? products : [{ name: product, price: o.price }], ['whatsapp', 'instagram']) }));
    if (ends) {
      add('last-call', { format: 'story', title: 'Last call', hook: deck.next('last-chance', event) }, (h) => ({
        html: head(`<div class="g-mid"><h2 class="g-h xl">${esc(h)}</h2></div><div class="g-bot"><p class="g-pill g-pill-ic">${ICON.clock}<span>${esc(ends)}</span></p></div>`),
        caption: caps(h, 'last-call', products, ['whatsapp', 'instagram']) }));
    }
    add('wide', { format: 'wide', title: 'X / LinkedIn card', hook: deck.next('launch', event) }, (h) => ({
      html: head(`<div class="g-row"><div class="g-col"><h2 class="g-h">${esc(own('wide') ?? (offTxt ? `${cap(offTxt)} ${product}` : h))}</h2>${priceRow}${endsChip}</div>${visual(null, 'side', 620)}</div>`),
      caption: caps(h, 'offer', products, ['x', 'linkedin']) }));
  } else if (!(o.posts ?? []).some((x) => x.headline || x.hook) ) {
    // Content-only with nothing written yet: three on-brand everyday posts, never sale posts.
    [['everyday-1', 'post'], ['everyday-2', 'square'], ['everyday-3', 'story']].forEach(([id, format]) => {
      add(id, { format, title: 'Everyday post', hook: deck.next('evergreen', event) }, (h, f) => ({
        html: head(`<div class="g-mid"><h2 class="g-h xl">${esc(h)}</h2></div><div class="g-bot">${feats(o.features)}<p class="g-cta">${esc(o.brand)}</p></div>`),
        caption: caps(h, 'content', [], f === 'story' ? ['whatsapp', 'instagram'] : ['instagram', 'whatsapp', 'x']) }));
    });
  }

  // Overrides: captions on existing slots; anything else becomes the AI's own post, in its own format.
  const SLOT_FORMAT = { offer: 'post', story: 'story', 'last-call': 'story', wide: 'wide', carousel: 'post' };
  for (const x of o.posts ?? []) {
    if (x.remove) continue;
    const target = posts.find((p) => p.id === x.id);
    if (target) {
      const newHook = x.hook ?? x.headline;
      if (newHook) for (const k of Object.keys(target.caption)) target.caption[k] = target.caption[k].replace(/^[^\n]*/, newHook);
      if (x.caption) target.caption = typeof x.caption === 'string' ? Object.fromEntries(Object.keys(target.caption).map((k) => [k, x.caption])) : x.caption;
      continue;
    }
    const headline = x.hook ?? x.headline;
    if (!headline) continue;
    const fmt = KIT_FORMATS[x.format] ? x.format : SLOT_FORMAT[x.id] ?? 'post';
    const id = x.id && !posts.some((p) => p.id === x.id) ? x.id : `custom-${posts.length}`;
    posts.push({ id, format: fmt, title: x.title ?? 'Post', hook: headline,
      html: head(`<div class="g-mid">${x.image ? photo(x.image, headline, 'big', `m-${id}`) : `<h2 class="g-h xl">${esc(headline)}</h2>`}</div><div class="g-bot">${x.image ? `<h2 class="g-h sm">${esc(headline)}</h2>` : ''}${x.sub ? `<p class="g-cta">${esc(x.sub)}</p>` : ''}</div>`),
      caption: x.caption ? (typeof x.caption === 'string' ? { instagram: x.caption, whatsapp: x.caption } : x.caption) : caps(headline, hasOffer ? 'offer' : 'content', hasOffer ? products : [], ['instagram', 'whatsapp']) });
  }
  if (Array.isArray(o.order) && o.order.length) posts.sort((a, b) => ((o.order.indexOf(a.id) + 1 || 999) - (o.order.indexOf(b.id) + 1 || 999)));

  const html = page({ o, t, posts, wm, link, product });
  return { html, contentOnly, hasOffer, posts: posts.map(({ id, format, title, hook, caption: c, slides }) => ({ id, format, size: `${KIT_FORMATS[format].w}x${KIT_FORMATS[format].h}`, title, hook, slides: slides?.length ?? 1, caption: c })), images: imgs };
}

function graphic(fmt, inner, wm, key) {
  const f = KIT_FORMATS[fmt];
  // A photo in the main area fills the whole graphic (full bleed) instead of sitting in a box.
  // Only mood / scene photos go full bleed. Product shots (often on white) stay in a panel so text stays readable.
  const bleed = /<div class="g-mid"><div class="ph [^"]*" data-p="m/.test(inner);
  return `<div class="fit" style="--w:${f.w};--h:${f.h}"><div class="g g-${fmt}${bleed ? ' bleed' : ''}" data-g="${key}" style="width:${f.w}px;height:${f.h}px">${inner}${wm}</div></div>`;
}

const UI = {
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0L8 7m4-4 4 4M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 18h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.48-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.8a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37A9.86 9.86 0 0 1 2.16 12C2.16 6.55 6.6 2.1 12.06 2.1a9.82 9.82 0 0 1 9.88 9.89c0 5.45-4.44 9.81-9.89 9.81z"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg>',
  flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m0 0h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 10.5 5-3v9l-5-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.78 15.27l-.4 5.6c.57 0 .82-.25 1.12-.54l2.68-2.56 5.56 4.07c1.02.56 1.74.27 2.02-.94l3.65-17.12c.33-1.51-.54-2.1-1.53-1.73L1.4 9.86c-1.48.57-1.46 1.4-.25 1.78l5.48 1.71L19.36 5.3c.6-.4 1.15-.18.7.22z"/></svg>',
};
const APP = { instagram: 'Instagram', whatsapp: 'WhatsApp', x: 'X', linkedin: 'LinkedIn', facebook: 'Facebook' };

function page({ o, t, posts, wm, link, product }) {
  const fonts = [...new Set([t.display, t.body, 'Inter'])].map((f) => `family=${f.replace(/ /g, '+')}:wght@400;600;700;800`).join('&');
  const cards = posts.map((p, i) => {
    const frames = (p.slides ?? [p.html]).map((h, j) => graphic(p.format, h, wm, `${i}-${j}`)).join('');
    const caps = Object.entries(p.caption);
    const fmt = KIT_FORMATS[p.format];
    return `<article class="card" data-post="${i}">
<div class="frames${p.slides ? ' many' : ''}">${frames}</div>
<div class="cbody">
<div class="chead"><div><h2>${esc(p.title)}</h2><p class="k">${esc(fmt.label.replace(/ \(.*\)$/, ''))} · ${fmt.w}×${fmt.h}${p.slides ? ` · ${p.slides.length} slides` : ''}</p></div><span class="st" data-st role="img" aria-label="Ready" title="Ready">${UI.check}</span></div>
<div class="tabs" role="tablist" aria-label="Caption for">${caps.map(([k], j) => `<button type="button" role="tab" aria-selected="${j === 0}" data-tab="${k}">${UI[k] ?? ''}<span>${esc(APP[k] ?? k)}</span></button>`).join('')}</div>
${caps.map(([k, v], j) => `<textarea data-cap="${k}" rows="6" aria-label="${esc(APP[k] ?? k)} caption"${j ? ' hidden' : ''}>${esc(v)}</textarea>`).join('')}
<div class="actions">
<div class="tools"><button type="button" class="ib" data-dl aria-label="Download${p.slides ? ` ${p.slides.length} slides` : ''}" title="Download${p.slides ? ` ${p.slides.length} slides` : ''}">${UI.download}</button><button type="button" class="ib" data-copy aria-label="Copy caption" title="Copy caption">${UI.copy}</button>${p.slides ? '' : `<button type="button" class="ib" data-play aria-label="Preview motion" title="Preview motion">${UI.play}</button><button type="button" class="ib" data-video aria-label="Download video" title="Download video (Reels, TikTok, Status)">${UI.video}</button>`}<button type="button" class="ib" data-flag aria-label="Something's wrong with this post" title="Something's wrong">${UI.flag}</button><span class="sep" aria-hidden="true"></span><a class="ib" data-l="wa" target="_blank" rel="noopener" aria-label="Post to WhatsApp" title="WhatsApp">${UI.whatsapp}</a><a class="ib" data-l="x" target="_blank" rel="noopener" aria-label="Post to X" title="X">${UI.x}</a><a class="ib" data-l="fb" target="_blank" rel="noopener" aria-label="Share on Facebook" title="Facebook">${UI.facebook}</a><a class="ib" data-l="li" target="_blank" rel="noopener" aria-label="Share on LinkedIn" title="LinkedIn">${UI.linkedin}</a><a class="ib" data-l="tg" target="_blank" rel="noopener" aria-label="Share on Telegram" title="Telegram">${UI.telegram}</a></div>
<button type="button" class="share" data-share>${UI.share}<span>Share</span></button>
</div>
<div class="fb" data-fb hidden><span>What is wrong?</span>${['off-brand', 'wrong-image', 'copy-does-not-fit', 'looks-generic', 'wrong-brand-name'].map((c) => `<button type="button" data-chip="${c}">${c.replace(/-/g, ' ')}</button>`).join('')}</div>
<p class="msg" data-msg aria-live="polite"></p>
</div>
</article>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.brand)} content kit</title><meta name="robots" content="noindex,nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fonts}&display=swap" rel="stylesheet" crossorigin="anonymous">
<style>
:root{--bg:${t.bg};--sf:${t.surface};--tx:${t.text};--mu:${t.muted};--ac:${t.accent};--ac2:${t.accent2};--at:${t.accentText};--d:'${t.display}',Impact,sans-serif;--b:'${t.body}',system-ui,sans-serif}
:root{--kbg:${t.bg};--kcard:${t.surface};--kink:${t.text};--kmu:${t.muted};--kline:${t.border ?? 'rgba(127,127,127,.25)'};--kfield:color-mix(in srgb,${t.surface} 85%,${t.bg});--kac:${t.accent};--kact:${t.accentText}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--kbg);color:var(--kink);font:400 15px/1.55 var(--b);-webkit-font-smoothing:antialiased}
svg{display:block}
.bar{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--kbg) 82%,transparent);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid var(--kline)}
.bar-in{max-width:1240px;margin:0 auto;padding:10px 20px;display:flex;align-items:center;gap:12px;min-height:60px}
.mark{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:var(--kac);color:var(--kact);font:700 15px/1 var(--d)}
.bar-b{font:600 15px/1.2 var(--b);letter-spacing:-.01em}.bar-c{color:var(--kmu);font-size:13px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar-dl{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:12px;border:0;background:var(--kink);color:var(--kbg);font:600 14px var(--b);cursor:pointer;transition:transform .15s,opacity .15s}.bar-dl svg{width:18px;height:18px}.bar-dl:hover{opacity:.9}.bar-dl:active{transform:scale(.97)}
.top{max-width:1240px;margin:0 auto;padding:48px 20px 8px}
.eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0 0 14px;padding:6px 12px;border-radius:999px;background:color-mix(in srgb,var(--kac) 14%,transparent);color:var(--kink);font:600 12px/1 var(--b);letter-spacing:.04em}
.eyebrow i{width:6px;height:6px;border-radius:50%;background:var(--kac)}
.top h1{font:700 clamp(28px,3.6vw,44px)/1.08 var(--d);letter-spacing:-.025em;margin:0 0 10px;max-width:22ch}
.top p{margin:0;color:var(--kmu);max-width:60ch;font-size:16px}.top a{color:var(--kink);text-underline-offset:3px}
.how{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0 0;padding:0;list-style:none}
.how li{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:12px;background:var(--kcard);border:1px solid var(--kline);font-size:13px;color:var(--kink)}.how svg{width:16px;height:16px;color:var(--kac)}
.grid{max-width:1240px;margin:0 auto;padding:28px 20px 96px;display:grid;gap:24px;align-items:start}
@media(min-width:720px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:1120px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.card{background:var(--kcard);border:1px solid var(--kline);border-radius:20px;overflow:hidden;display:flex;flex-direction:column;min-width:0;box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 32px -18px rgba(0,0,0,.18);transition:box-shadow .2s,transform .2s}
.card:hover{box-shadow:0 1px 2px rgba(0,0,0,.05),0 22px 48px -22px rgba(0,0,0,.28)}
.frames{display:grid;gap:10px;padding:12px 12px 0}.frames.many{grid-auto-flow:column;grid-auto-columns:84%;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px;scrollbar-width:thin}.frames.many .fit{scroll-snap-align:start}
.fit{position:relative;width:100%;aspect-ratio:var(--w)/var(--h);overflow:hidden;border-radius:12px;background:var(--kfield)}
.fit .g{position:absolute;top:0;left:0;transform-origin:0 0}
.cbody{display:flex;flex-direction:column;gap:12px;padding:16px 16px 14px}
.chead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.chead h2{font:600 16px/1.3 var(--b);letter-spacing:-.01em;margin:0 0 2px}.k{margin:0;color:var(--kmu);font-size:12.5px}
.st{flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,#16a34a 16%,transparent);color:#15803d}.st svg{width:14px;height:14px}.rep-card .st{background:color-mix(in srgb,#d97706 18%,transparent);color:#b45309}
.tabs{display:flex;gap:4px;padding:4px;border-radius:12px;background:var(--kfield);border:1px solid var(--kline);width:max-content;max-width:100%;overflow-x:auto}
.tabs button{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--kmu);font:600 12.5px var(--b);cursor:pointer;white-space:nowrap}.tabs button svg{width:15px;height:15px}
.tabs button[aria-selected=true]{background:var(--kcard);color:var(--kink);box-shadow:0 1px 2px rgba(0,0,0,.08),0 0 0 1px var(--kline)}
textarea{width:100%;border:1px solid var(--kline);border-radius:12px;padding:12px 14px;font:inherit;font-size:14px;line-height:1.6;resize:vertical;background:var(--kfield);color:var(--kink);min-height:132px}
textarea:focus{outline:none;border-color:var(--kac);box-shadow:0 0 0 3px color-mix(in srgb,var(--kac) 22%,transparent)}
.actions{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.tools{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.ib{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;border:0;background:transparent;color:var(--kink);cursor:pointer;text-decoration:none;transition:background .15s,color .15s}.ib svg{width:19px;height:19px}
.ib:hover{background:var(--kfield)}.ib[hidden]{display:none}.sep{width:1px;height:22px;background:var(--kline);margin:0 4px}
.share{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px 0 14px;border-radius:12px;border:0;background:var(--kac);color:var(--kact);font:600 14px var(--b);cursor:pointer;transition:transform .15s,filter .15s}.share svg{width:18px;height:18px}.share:hover{filter:brightness(1.06)}.share:active{transform:scale(.97)}
.msg{margin:0;min-height:1.2em;font-size:12.5px;color:var(--kmu)}
.fb{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:10px;border-radius:12px;background:var(--kfield);border:1px solid var(--kline);font-size:12.5px}.fb[hidden]{display:none}.fb span{color:var(--kmu);margin-right:4px}
.fb button{height:28px;padding:0 10px;border-radius:999px;border:1px solid var(--kline);background:var(--kcard);color:var(--kink);font:600 12px var(--b);cursor:pointer;text-transform:capitalize}
button:focus-visible,a:focus-visible{outline:2px solid var(--kac);outline-offset:2px}
@media(max-width:420px){.sep{display:none}.share span{display:none}.share{width:40px;padding:0;justify-content:center}}
/* graphics */
.g{background:radial-gradient(90% 60% at 50% 40%,color-mix(in srgb,var(--ac) 22%,transparent),transparent 70%),var(--bg);color:var(--tx);font-family:var(--b);display:flex;flex-direction:column;gap:40px;padding:72px;overflow:hidden}
.g-wide{padding:64px 80px}
.g-top{display:flex;justify-content:space-between;align-items:center;gap:20px;font:700 34px/1 var(--b)}.g-brand img{height:64px;width:auto;display:block}
.g-ev{font:700 24px/1 var(--b);letter-spacing:.14em;text-transform:uppercase;padding:14px 22px;border-radius:999px;background:var(--ac);color:var(--at)}
.g-mid{flex:1;display:grid;place-items:center;min-height:0}
.g-bot{display:flex;flex-direction:column;gap:16px}
.g-h{font:400 112px/.98 var(--d);margin:0;letter-spacing:-.02em}.g-h.sm{font-size:84px}.g-h.xl{font-size:110px;text-align:center;text-transform:none}
.g-story .g-h{font-size:150px}.g-story .g-h.xl{font-size:120px}
.g-pr{display:flex;align-items:baseline;gap:24px;margin:0}.g-pr b{font:400 96px/1 var(--d);color:var(--ac)}.g-pr s{font-size:44px;color:var(--mu)}
.g-cta{margin:0;font:600 38px/1.2 var(--b);color:var(--mu)}.g-n{margin:0;font:700 30px var(--b);color:var(--ac)}
.g-pill{align-self:flex-start;margin:6px 0 0;padding:26px 44px;border-radius:999px;background:var(--ac);color:var(--at);font:800 40px/1 var(--b)}
.ph{position:relative;width:100%;height:100%;border-radius:36px;overflow:hidden;display:grid;place-items:center;background:color-mix(in srgb,var(--tx) 6%,transparent)}.ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.rep-l{position:absolute;left:24px;bottom:24px;padding:10px 16px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font:600 22px/1 var(--b);letter-spacing:.02em}
.np{width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 24px;font:400 130px/.98 var(--d);color:var(--tx);letter-spacing:-.01em}.np span{max-width:100%;overflow-wrap:anywhere}
.g:has(.np) .g-bot .g-h{display:none}
.need-l{display:none}.ph.need{border:4px dashed color-mix(in srgb,var(--tx) 35%,transparent);background:color-mix(in srgb,var(--tx) 4%,transparent)}.ph.need .need-l{display:block;text-align:center;font:500 40px/1.3 var(--b);color:var(--mu)}.ph.need .need-l b{color:var(--tx);font-weight:700}
.ty{width:auto;max-width:100%;height:auto;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;font-family:var(--d);line-height:.82;letter-spacing:-.02em;color:var(--ac);text-align:center}.ty span{display:block}.ty em{display:block;font-style:normal;font-size:.34em;letter-spacing:.06em;text-transform:uppercase;color:var(--tx);margin-top:.12em}
.g-row{flex:1;display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center;padding-top:30px}.g-col{display:flex;flex-direction:column;gap:18px}.g-wide .g-h{font-size:110px}
.g-row .ph,.g-row .ty{height:100%;max-height:640px;width:100%}
/* layers: decoration behind, content above */
${MOTIF_CSS}
.deco{position:absolute;z-index:0;pointer-events:none}
.g-top,.g-mid,.g-bot,.g-row{position:relative;z-index:1}
.g-chip{display:inline-flex;align-items:center;gap:14px;align-self:flex-start;margin:4px 0 0;padding:16px 26px;border-radius:999px;background:color-mix(in srgb,var(--tx) 9%,var(--bg));font:600 32px/1 var(--b);color:var(--tx)}
.g-chip svg,.g-pill-ic svg{width:34px;height:34px;flex:none}.g-pill-ic{display:inline-flex;align-items:center;gap:14px}
.g-feats{display:flex;flex-wrap:wrap;gap:12px;margin:0;padding:0;list-style:none}
.g-feats li{display:inline-flex;align-items:center;gap:10px;padding:12px 20px;border-radius:999px;background:var(--bg);border:2px solid color-mix(in srgb,var(--tx) 20%,transparent);font:600 26px/1 var(--b)}.g-feats svg{width:26px;height:26px;color:var(--ac)}
.g-stk{position:absolute;z-index:2;top:150px;right:60px;width:200px;height:200px;border-radius:50%;background:var(--ac);color:var(--at);display:grid;place-items:center;transform:rotate(-12deg);box-shadow:0 22px 44px -20px rgba(0,0,0,.55)}.g-stk b{font:400 70px/1 var(--d)}
.g-story .g-stk{top:190px}
/* full bleed: the photo is the canvas; a soft scrim keeps text readable */
/* product photos show the whole product (no crop) on a clean panel */
/* product images: whole product, no white card. Illustrations and cut-outs (SVG/PNG) float frameless. */
.ph:not([data-p^="m"]){background:transparent}.ph:not([data-p^="m"]) img{object-fit:contain}
.ph.photo:not([data-p^="m"]){background:color-mix(in srgb,var(--tx) 5%,var(--bg))}.ph.photo:not([data-p^="m"]) img{object-fit:cover}
/* flex items with a z-index form their own layer, so the photo's container must not have one */
.g.bleed .g-mid{position:static;z-index:auto}.g.bleed .g-top,.g.bleed .g-bot{z-index:2}.g.bleed .g-mid .ph{position:absolute;inset:0;border-radius:0;z-index:0;background:#111}
.g.bleed::after{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.5) 0%,rgba(0,0,0,0) 24%,rgba(0,0,0,0) 46%,rgba(0,0,0,.82) 100%)}
.g.bleed .g-top,.g.bleed .g-bot{color:#fff}.g.bleed .g-pr s{color:rgba(255,255,255,.72)}.g.bleed .g-cta{color:rgba(255,255,255,.88)}
.g.bleed .g-chip{background:rgba(255,255,255,.16);color:#fff}.g.bleed .g-feats li{border-color:rgba(255,255,255,.4);color:#fff}.g.bleed .deco{display:none}
.g.bleed .rep-l{top:150px;left:72px;bottom:auto;z-index:2}.g.bleed .q4wm{color:#fff;z-index:3}
.q4wm{display:none;position:absolute;right:28px;bottom:24px;font:600 22px/1 var(--b);color:var(--tx);opacity:.6}
${o.watermark ? '.q4wm{display:block}' : ''}
</style></head><body>
<div class="bar"><div class="bar-in"><span class="mark" aria-hidden="true">${esc(o.brand.slice(0, 1).toUpperCase())}</span><b class="bar-b">${esc(o.brand)}</b><span class="bar-c" data-count>${posts.length} posts</span><button type="button" class="bar-dl" data-dlall>${UI.download}<span>Download all</span></button></div></div>
<header class="top"><p class="eyebrow"><i></i>Content kit${THEMES[o.theme] && o.theme !== 'default' ? ` · ${esc(t.eyebrow)}` : ''}</p><h1>${posts.length} posts, ready to share</h1><p>Captions are written for each app. Edit anything, then share straight from your phone.${link ? ` Every post links to <a href="${esc(link)}">${esc(link.replace(/^https?:\/\//, ''))}</a>.` : ''}</p>
<ul class="how"><li>${UI.phone}Share on your phone posts the image to Instagram, TikTok or WhatsApp</li><li>${UI.download}Download PNGs on a computer</li><li>${UI.edit}Tap a caption to edit it</li></ul></header>
<main class="grid">${cards}</main>
<script src="https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js"></script>
<script>
(function(){
var link=${JSON.stringify(link)};
function fit(){document.querySelectorAll('.fit').forEach(function(f){var g=f.firstElementChild;g.style.transform='scale('+(f.clientWidth/parseFloat(getComputedStyle(f).getPropertyValue('--w')))+')'})}
/* Statement type: measured in the browser and shrunk until it sits inside the frame margins. */
function fitType(){document.querySelectorAll('.ty').forEach(function(t){var fs=parseFloat(t.style.fontSize)||400;var box=t.parentNode;var maxW=box.clientWidth*0.92,maxH=box.clientHeight*0.92;var i=0;while((t.scrollWidth>maxW||t.scrollHeight>maxH)&&fs>60&&i++<80){fs-=8;t.style.fontSize=fs+'px'}})}
function fitAll(){fitType();fit()}
addEventListener('resize',fit);if(document.fonts)document.fonts.ready.then(fitAll);fitAll();
function msg(card,s){card.querySelector('[data-msg]').textContent=s}
function cap(card){var t=card.querySelector('textarea:not([hidden])');return t?t.value:''}
function msg(card,s){card.querySelector('[data-msg]').textContent=s}
/* Motion: one frame function drives the preview and the exported video, so they always match.
   Text rises in, price and chips follow, stickers pop, photos slowly zoom, the motif drifts. 6 seconds. */
var DUR=6,FPS=24;
function ease(x){x=Math.max(0,Math.min(1,x));return 1-Math.pow(1-x,3)}
function frame(g,t){
  function rise(sel,at){g.querySelectorAll(sel).forEach(function(el){var p=ease((t-at)/0.9);el.style.opacity=p;el.style.transform='translateY('+((1-p)*36)+'px)'})}
  rise('.g-h,.ty,.np',0.2);rise('.g-pr',0.55);rise('.g-feats,.g-chip,.g-pill,.g-cta',0.8);
  g.querySelectorAll('.g-stk').forEach(function(el){var p=ease((t-1.1)/0.6);el.style.opacity=p;el.style.transform='rotate(-12deg) scale('+(0.6+0.4*p)+')'});
  g.querySelectorAll('.ph img').forEach(function(el){el.style.transform='scale('+(1+0.06*Math.min(1,t/DUR))+')'});
  g.querySelectorAll('.deco').forEach(function(el){el.style.transform='translate('+(-8*Math.sin(t/DUR*Math.PI))+'px,'+(10*Math.sin(t/DUR*Math.PI))+'px) rotate('+(t*1.5)+'deg)'})
}
function resetMotion(g){g.querySelectorAll('.g-h,.ty,.np,.g-pr,.g-feats,.g-chip,.g-pill,.g-cta,.g-stk,.ph img,.deco').forEach(function(el){el.style.opacity='';el.style.transform=''})}
function preview(card){var g=card.querySelector('.g');if(!g||g._playing)return;g._playing=true;var t0=performance.now();(function loop(now){var t=(now-t0)/1000;frame(g,t);if(t<DUR)requestAnimationFrame(loop);else{resetMotion(g);g._playing=false}})(t0)}
function video(card){
  var g=card.querySelector('.g');if(!g||typeof MediaRecorder==='undefined'){msg(card,'Video export needs Chrome, Edge or Safari.');return}
  var w=parseFloat(g.style.width),h=parseFloat(g.style.height),cv=document.createElement('canvas');cv.width=w;cv.height=h;var cx=cv.getContext('2d');
  var mime=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm'].filter(function(m){return MediaRecorder.isTypeSupported(m)})[0];
  if(!mime){msg(card,'This browser cannot record video.');return}
  var rec=new MediaRecorder(cv.captureStream(FPS),{mimeType:mime,videoBitsPerSecond:8e6}),chunks=[];rec.ondataavailable=function(e){if(e.data.size)chunks.push(e.data)};
  var n=Math.round(DUR*FPS),i=0;rec.start();rec.pause();
  function step(){
    if(i>n){resetMotion(g);rec.stop();return}
    frame(g,i/FPS);msg(card,'Rendering video '+Math.round(i/n*100)+'%');
    htmlToImage.toCanvas(g,{width:w,height:h,pixelRatio:1,cacheBust:false,style:{transform:'none'}}).then(function(c){cx.clearRect(0,0,w,h);cx.drawImage(c,0,0);rec.resume();setTimeout(function(){rec.pause();i++;step()},1000/FPS)},function(){resetMotion(g);rec.stop();msg(card,'Could not render the video. Try again.')})
  }
  rec.onstop=function(){if(!chunks.length)return;var ext=mime.indexOf('mp4')>-1?'mp4':'webm';save(new File([new Blob(chunks,{type:mime.split(';')[0]})],name(card,0).replace(/\.png$/,'.'+ext),{type:mime.split(';')[0]}));msg(card,ext==='mp4'?'Video downloaded (MP4).':'Video downloaded (WebM). Instagram and TikTok accept it; convert to MP4 if an app asks.')};
  step()
}
function png(g){var w=parseFloat(g.style.width),h=parseFloat(g.style.height);return htmlToImage.toBlob(g,{width:w,height:h,pixelRatio:1,cacheBust:true,style:{transform:'none'}})}
function name(card,j){return (${JSON.stringify(o.brand.replace(/[^a-z0-9]+/gi, '-').toLowerCase())}+'-'+card.querySelector('h2').textContent.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+(j?'-'+(j+1):'')+'.png')}
function files(card){return Promise.all(Array.prototype.map.call(card.querySelectorAll('.g'),function(g,j){return png(g).then(function(b){return new File([b],name(card,j),{type:'image/png'})})}))}
function save(f){var a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1500)}
function refresh(){document.querySelectorAll('.card').forEach(function(c){var st=c.querySelector('[data-st]');var r=c.querySelector('.ph.rep');c.classList.toggle('rep-card',!!r);if(st){var lab=r?'Ready, uses a representative photo':'Ready';st.title=lab;st.setAttribute('aria-label',lab)}});var cnt=document.querySelector('[data-count]');if(cnt)cnt.textContent=document.querySelectorAll('.card').length+' posts ready'}
document.addEventListener('click',function(e){if(!e.target.closest('[data-dlall]'))return;var cards=[].slice.call(document.querySelectorAll('.card'));var b=e.target.closest('[data-dlall]');b.lastChild.textContent='Preparing...';cards.reduce(function(pr,c){return pr.then(function(){return files(c).then(function(fs){fs.forEach(save)})})},Promise.resolve()).then(function(){b.lastChild.textContent='Download all'},function(){b.lastChild.textContent='Try again'})});
var KIT=window.Q4_KIT||null;
function setPhoto(key,url,scope){(/^m/.test(key)?scope:document).querySelectorAll('.ph[data-p="'+key+'"]').forEach(function(ph){ph.classList.remove('need');ph.classList.remove('rep');var tag=ph.querySelector('.rep-l');if(tag)tag.remove();var im=ph.querySelector('img')||document.createElement('img');im.removeAttribute('crossorigin');im.src=url;im.alt='';if(!im.parentNode)ph.insertBefore(im,ph.firstChild)});refresh()}
document.querySelectorAll('.card').forEach(function(card){
  card.querySelectorAll('[data-tab]').forEach(function(b){b.addEventListener('click',function(){card.querySelectorAll('[data-tab]').forEach(function(x){x.setAttribute('aria-selected',String(x===b))});card.querySelectorAll('[data-cap]').forEach(function(t){t.hidden=t.getAttribute('data-cap')!==b.getAttribute('data-tab')});links()})});
  function links(){var c=encodeURIComponent(cap(card)),u=encodeURIComponent(link);var m={wa:'https://wa.me/?text='+c,x:'https://twitter.com/intent/tweet?text='+c,fb:link?'https://www.facebook.com/sharer/sharer.php?u='+u:'',li:link?'https://www.linkedin.com/sharing/share-offsite/?url='+u:'',tg:'https://t.me/share/url?url='+u+'&text='+c};card.querySelectorAll('[data-l]').forEach(function(a){var h=m[a.getAttribute('data-l')];if(h){a.href=h;a.hidden=false}else a.hidden=true})}
  links();card.querySelectorAll('textarea').forEach(function(t){t.addEventListener('input',links)});
  card.querySelector('[data-copy]').addEventListener('click',function(){navigator.clipboard.writeText(cap(card)).then(function(){msg(card,'Caption copied.')},function(){msg(card,'Select the caption and copy it.')})});
  card.querySelector('[data-dl]').addEventListener('click',function(){msg(card,'Preparing image...');files(card).then(function(fs){fs.forEach(save);msg(card,fs.length>1?fs.length+' images downloaded.':'Image downloaded.')},function(){msg(card,'Could not create the image. Try again or take a screenshot.')})});
  card.querySelector('[data-share]').addEventListener('click',function(){msg(card,'Preparing...');files(card).then(function(fs){var data={files:fs,text:cap(card)};if(navigator.canShare&&navigator.canShare(data)){return navigator.share(data).then(function(){msg(card,'Shared.')},function(){msg(card,'')})}navigator.clipboard&&navigator.clipboard.writeText(cap(card)).catch(function(){});fs.forEach(save);msg(card,'Your browser cannot share images directly. Images downloaded and caption copied: open the app and post.')},function(){msg(card,'Could not create the image. Try again.')})});
});
if(KIT&&KIT.photos)Object.keys(KIT.photos).forEach(function(k){setPhoto(k,KIT.photos[k],document)});
document.querySelectorAll('.card').forEach(function(card){var f=card.querySelector('[data-flag]'),box=card.querySelector('[data-fb]');if(!f)return;if(!KIT){f.hidden=true;return}
  f.addEventListener('click',function(){box.hidden=!box.hidden});
  box.querySelectorAll('[data-chip]').forEach(function(b){b.addEventListener('click',function(){fetch('/__q4/feedback/'+KIT.id,{method:'POST',body:JSON.stringify({post:card.getAttribute('data-post'),chip:b.getAttribute('data-chip')})}).then(function(){box.hidden=true;msg(card,'Thanks, the Quint AI team will look at this post.')},function(){msg(card,'Could not send. Try again.')})})})});
document.querySelectorAll('.card').forEach(function(card){var pl=card.querySelector('[data-play]'),vd=card.querySelector('[data-video]');if(pl)pl.addEventListener('click',function(){preview(card)});if(vd)vd.addEventListener('click',function(){video(card)})});
refresh();
})();
</script></body></html>`;
}
