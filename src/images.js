// Free, licence-checked imagery for pages and posts.
// Providers, best first: Pexels (PEXELS_API_KEY), Unsplash (UNSPLASH_ACCESS_KEY),
// then keyless Wikimedia Commons and Openverse. Every result carries its licence
// and an attribution line. Photos that likely show third-party logos are flagged,
// because using another brand's product photo on your sale page misleads buyers.

const UA = 'quint-ai-mcp (https://github.com/phestplus/quint-ai-mcp)';

// Brands whose logos or products commonly appear in stock photos.
const TRADEMARKS = ['nike', 'adidas', 'converse', 'vans', 'puma', 'reebok', 'yeezy', 'jordan', 'new balance', 'asics', 'fila', 'gucci', 'louis vuitton', 'chanel', 'prada', 'dior', 'hermes', 'rolex', 'apple', 'iphone', 'macbook', 'samsung', 'sony', 'playstation', 'xbox', 'nintendo', 'toyota', 'mercedes', 'bmw', 'audi', 'ferrari', 'lamborghini', 'porsche', 'tesla', 'ford', 'honda', 'lexus', 'range rover', 'kia', 'chevrolet', 'corvette', 'hyundai', 'nissan', 'volkswagen', 'volvo', 'jaguar', 'bentley', 'rolls-royce', 'maserati', 'mazda', 'subaru', 'jeep', 'peugeot', 'renault', 'fiat', 'mclaren', 'bugatti', 'aston martin', 'coca-cola', 'pepsi', 'starbucks', 'mcdonald', 'ikea', 'zara', 'h&m', 'supreme', 'balenciaga', 'off-white', 'lego', 'disney', 'barbie', 'marvel'];

const brandRisk = (text) => TRADEMARKS.find((t) => String(text ?? '').toLowerCase().includes(t)) ?? null;
const strip = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const short = (t, n = 60) => { const x = String(t ?? '').trim(); return x.length > n ? `${x.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : x; };

async function getJson(url, headers = {}, ms = 12000) {
  const res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

async function pexels(q, { orientation, perPage }) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const j = await getJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${perPage}${orientation ? `&orientation=${orientation}` : ''}`, { authorization: key });
  return j.photos.map((p) => ({
    provider: 'pexels', url: p.src.large2x, full: p.src.original, thumb: p.src.medium, width: p.width, height: p.height,
    alt: p.alt || q, author: p.photographer, authorUrl: p.photographer_url, page: p.url, license: 'Pexels License', licenseUrl: 'https://www.pexels.com/license/',
    attribution: `Photo by ${p.photographer} on Pexels`, attributionRequired: false, color: p.avg_color,
  }));
}

async function unsplash(q, { orientation, perPage }) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  const j = await getJson(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=${perPage}${orientation ? `&orientation=${orientation}` : ''}&content_filter=high`, { authorization: `Client-ID ${key}` });
  return j.results.map((p) => ({
    provider: 'unsplash', url: `${p.urls.raw}&w=2000&q=80&auto=format&fit=crop`, full: p.urls.full, thumb: p.urls.small, width: p.width, height: p.height,
    alt: p.alt_description || q, author: p.user.name, authorUrl: `${p.user.links.html}?utm_source=quint-ai&utm_medium=referral`, page: p.links.html,
    license: 'Unsplash License', licenseUrl: 'https://unsplash.com/license', attribution: `Photo by ${p.user.name} on Unsplash`, attributionRequired: false,
    color: p.color, downloadLocation: p.links.download_location,
  }));
}

async function commons(q, { perPage, minWidth }) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`${q} filetype:bitmap`)}&gsrnamespace=6&gsrlimit=${Math.min(perPage * 3, 40)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=2000&format=json&origin=*`;
  const j = await getJson(url);
  const pages = Object.values(j.query?.pages ?? {});
  return pages.map((p) => {
    const i = p.imageinfo?.[0]; if (!i) return null;
    const m = i.extmetadata ?? {};
    const lic = m.LicenseShortName?.value ?? '';
    if (!/^(cc0|public domain|cc by(-sa)? \d)/i.test(lic)) return null;   // commercial-use licences only
    if (i.width < minWidth) return null;
    const author = short(strip(m.Artist?.value), 40) || 'Unknown';
    const title = short(strip(p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '')));
    return {
      provider: 'wikimedia', url: i.thumburl ?? i.url, full: i.url, thumb: i.thumburl, width: i.width, height: i.height,
      alt: strip(m.ImageDescription?.value).slice(0, 140) || title, author, page: i.descriptionurl, license: lic, licenseUrl: m.LicenseUrl?.value ?? null,
      attribution: `"${title}" by ${author}, ${lic}${/cc0|public domain/i.test(lic) ? '' : ', via Wikimedia Commons'}`, attributionRequired: !/cc0|public domain/i.test(lic),
      shareAlike: /-sa/i.test(lic),
    };
  }).filter(Boolean);
}

async function openverse(q, { perPage, orientation }) {
  const ar = orientation === 'landscape' ? 'wide' : orientation === 'portrait' ? 'tall' : '';
  const j = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license_type=commercial&size=large&page_size=${perPage}${ar ? `&aspect_ratio=${ar}` : ''}`, {}, 8000);
  return j.results.map((r) => ({
    provider: 'openverse', url: r.url, full: r.url, thumb: r.thumbnail, width: r.width, height: r.height, alt: r.title, author: r.creator ?? 'Unknown',
    page: r.foreign_landing_url, license: `${r.license.toUpperCase()} ${r.license_version ?? ''}`.trim(), licenseUrl: r.license_url,
    attribution: r.attribution ?? `"${r.title}" by ${r.creator}`, attributionRequired: !/cc0|pdm/i.test(r.license), shareAlike: /sa/i.test(r.license),
  }));
}

/**
 * Search free, commercially usable photos.
 * @param {string} query e.g. "sneakers on concrete night"
 * @param {object} [o]
 * @param {'landscape'|'portrait'|'squarish'} [o.orientation]
 * @param {number} [o.count] results wanted (default 8)
 * @param {boolean} [o.allowBrands] include photos that likely show third-party logos (default false)
 * @param {boolean} [o.photosOnly] drop drawings, engravings and archive scans (default true)
 * @returns {Promise<{ images: object[], providersTried: string[], errors: string[], note: string }>}
 */
export async function findImages(query, o = {}) {
  const count = Math.min(20, Math.max(1, o.count ?? 8));
  const opts = { orientation: o.orientation, perPage: Math.max(count, 10), minWidth: 1400 };
  const providersTried = [];
  const errors = [];
  let images = [];
  for (const [name, fn] of [['pexels', pexels], ['unsplash', unsplash], ['wikimedia', commons], ['openverse', openverse]]) {
    if (images.length >= count) break;
    try {
      const r = await fn(query, opts);
      if (r === null) continue;                     // provider not configured
      providersTried.push(name);
      images.push(...r);
    } catch (e) {
      providersTried.push(name);
      errors.push(`${name}: ${e.message}`);
    }
  }
  images = images.map((im) => ({ ...im, brandRisk: brandRisk(`${im.alt} ${im.page}`) }));
  // Never fill a page with something unrelated: a result must mention at least one subject word of the query.
  const STOP = new Set(['with', 'from', 'that', 'this', 'into', 'over', 'their', 'your', 'some', 'very', 'warm', 'light', 'soft', 'bright', 'dark', 'home', 'together', 'photo', 'image', 'picture', 'happy', 'smiling', 'young', 'black', 'white', 'african', 'nigerian', 'person', 'people']);
  const terms = String(query).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, ''));
  const relevant = (im) => !terms.length || terms.some((t) => new RegExp(`(^|[^a-z])${t}`, 'i').test(`${im.alt ?? ''}`));
  const before = images.length;
  images = images.filter(relevant);
  const dropped = before - images.length;
  // Photographs only: archive scans, engravings and paintings look wrong on a modern sales page.
  if (o.photosOnly !== false) images = images.filter((im) => !/drawing|engraving|lithograph|etching|fashion plate|illustration|painting|museum|(^|[^a-z])met([^a-z]|$)|lacma|scan|poster|diagram|logo|icon|\bmap\b/i.test(`${im.alt} ${im.page}`));
  // Skip broken, abandoned or damaged subjects unless asked for.
  images = images.filter((im) => !/rust|abandon|wreck|crash|damaged|broken|ruin|dirty|trash/i.test(im.alt));
  if (!o.allowBrands) images = images.filter((im) => !im.brandRisk);
  // Prefer the requested orientation, then resolution.
  const want = o.orientation;
  const orient = (im) => (im.width > im.height * 1.15 ? 'landscape' : im.height > im.width * 1.15 ? 'portrait' : 'squarish');
  images.sort((a, b) => (want ? (orient(b) === want) - (orient(a) === want) : 0) || b.width - a.width);
  const premium = providersTried.some((p) => p === 'pexels' || p === 'unsplash');
  return {
    images: images.slice(0, count),
    ...(dropped ? { droppedAsUnrelated: dropped } : {}),
    ...(images.length ? {} : { nothingFits: `Nothing found matches "${query}"${terms.length ? ` (looked for: ${terms.join(', ')})` : ''}. Try simpler words, use the seller's own photos, or connect Quint AI Cloud for studio photo search.` }),
    providersTried, errors,
    note: [
      premium ? null : 'Tip: set PEXELS_API_KEY or UNSPLASH_ACCESS_KEY (both free) for studio-quality photos. Keyless sources are mixed quality.',
      'Use stock photos for mood, lifestyle and backgrounds. Show your own photos for the actual product you sell.',
      'Keep the attribution line on the page when attributionRequired is true; CC BY-SA images must stay under the same licence.',
    ].filter(Boolean).join(' '),
  };
}

const PEOPLE = /(^|[^a-z])(woman|women|man|men|girl|boy|child|children|kid|baby|people|person|couple|family|lady|guy|model|bride|crowd|portrait|face)s?([^a-z]|$)/;

// Words a photo's description must contain to count as showing this kind of product.
export const SUBJECT_WORDS = {
  // Unambiguous words only ("slide" also means playground slides, "heel" a body part).
  footwear: ['sneaker', 'shoe', 'trainer', 'footwear', 'boot', 'sandal', 'loafer', 'slipper'],
  fashion: ['dress', 'outfit', 'fashion', 'clothing', 'clothes', 'shirt', 'skirt', 'jacket', 'gown', 'wear', 'model', 'style'],
  beauty: ['skincare', 'cosmetic', 'cream', 'serum', 'lotion', 'makeup', 'beauty', 'bottle', 'perfume', 'skin'],
  jewelry: ['jewelry', 'jewellery', 'ring', 'necklace', 'bracelet', 'earring', 'gold', 'diamond', 'gem'],
  electronics: ['phone', 'laptop', 'headphone', 'gadget', 'speaker', 'camera', 'tablet', 'watch', 'electronic'],
  automotive: ['car', 'vehicle', 'suv', 'sedan', 'automobile', 'truck'],
  home: ['interior', 'living room', 'sofa', 'furniture', 'lamp', 'decor', 'kitchen', 'bedroom', 'home'],
  food: ['food', 'meal', 'dish', 'plate', 'cake', 'drink', 'restaurant', 'snack', 'bowl'],
  fitness: ['fitness', 'gym', 'workout', 'exercise', 'training', 'yoga', 'run'],
  kids: ['child', 'kid', 'toy', 'baby', 'children'],
};

/**
 * Real photos that actually show the subject: every result must mention one of the subject words
 * (from the niche and the seller's own product words) and carry no third-party brand.
 * Returns [] rather than a loosely related photo.
 */
export async function matchingImages({ nicheId, product = '', attributes = '', mood = '', orientation, count = 3, search = null, productShot = false, mustMatch = null }) {
  const own = String(product).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3).map((w) => w.replace(/(es|s)$/, ''));
  const words = [...new Set([...(SUBJECT_WORDS[nicheId] ?? []), ...own])];
  const query = [attributes, product || words[0], mood].filter(Boolean).join(' ').trim();
  const run = (q) => (search ? search(q, { orientation, count: 40 }) : findImages(q, { orientation, count: Math.max(count * 4, 12) }));
  let r = await run(query);
  // Judge by the photo's own description only (a page URL or file name is not evidence).
  const hit = (im) => words.some((w) => new RegExp(`(^|[^a-z])${w}`, 'i').test(im.alt ?? ''));
  const clean = r.images.filter((im) => !brandRisk(`${im.alt} ${im.page}`));
  // Tag lists (Pixabay) put the main subject first: keep photos where the product is among the first
  // tags, then prefer the requested attributes (e.g. "white") and earlier positions.
  const attrs = String(attributes).toLowerCase().split(/\s+/).filter(Boolean);
  const rank = (im) => {
    const alt = String(im.alt ?? '').toLowerCase();
    const tags = alt.includes(',') ? alt.split(/\s*,\s*/) : null;
    const pos = tags ? tags.findIndex((t) => words.some((w) => new RegExp(`(^|[^a-z])${w}`).test(t))) : 0;
    const people = tags ? tags.slice(0, 6).some((t) => PEOPLE.test(t)) : PEOPLE.test(alt);
    const studio = /isolated|white background|studio|product|still life/.test(alt) ? 1 : 0;
    return { im, pos, people, studio, attr: attrs.filter((x) => alt.includes(x)).length };
  };
  // A representative product photo shows the product on its own, not a social scene.
  // When the product name names its type (slide, boot, heel...), the photo must show that type.
  const typeOk = (im) => !mustMatch?.length || mustMatch.some((w) => new RegExp('(^|[^a-z])' + w).test(String(im.alt ?? '').toLowerCase()));
  const ranked = clean.filter(hit).filter(typeOk).map(rank).filter((x) => x.pos >= 0 && x.pos <= 2 && !(productShot && x.people)).sort((a, b) => b.studio - a.studio || b.attr - a.attr || a.pos - b.pos).map((x) => x.im);
  // Very specific searches can come back empty: retry once with just the product type.
  const broad = [product || words[0], mood].filter(Boolean).join(' ').trim();
  if (!ranked.length && broad && broad !== query) return matchingImages({ nicheId, product, attributes: '', mood: '', orientation, count, search, productShot, mustMatch });
  return { query, images: ranked.slice(0, count), providersTried: r.providersTried ?? ['quint-ai-cloud'], words };
}

/** Product-type words implied by a product name, e.g. "Street Slide" needs a slide or sandal. */
export function typeWords(name) {
  const n = String(name ?? '').toLowerCase();
  if (/slide|sandal|slipper|flip.?flop/.test(n)) return ['slide', 'sandal', 'slipper', 'flip'];
  if (/boot/.test(n)) return ['boot'];
  if (/heel|pump|stiletto/.test(n)) return ['heel', 'pump', 'stiletto'];
  if (/loafer|moccasin/.test(n)) return ['loafer', 'moccasin'];
  if (/sneaker|trainer|runner|court|kick/.test(n)) return ['sneaker', 'trainer', 'running shoe', 'sport shoe'];
  return null;
}

export { brandRisk };
