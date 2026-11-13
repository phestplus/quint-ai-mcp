// brand_extract: read a brand's own website and propose a brand profile (look, wordmark, logo,
// positioning hints, copy samples for the AI to judge voice). Nothing is guessed from outside the site;
// every value carries the evidence it came from, and the seller confirms before it is saved.

const UA = 'quint-ai-mcp brand reader (+https://github.com/phestplus/quint-ai-mcp)';
const HEX6 = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;

// Many sites (behind bot protection, or on shop builders) refuse unknown readers. We ask honestly first, then once as an ordinary browser.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
async function get(url, ms = 12000, max = 600_000) {
  const ask = (ua) => fetch(url, { headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml,text/css,*/*;q=0.8', 'accept-language': 'en' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  let r = await ask(UA);
  if ([401, 403, 406, 429, 503].includes(r.status)) r = await ask(BROWSER_UA);
  if (!r.ok) throw new Error(`${new URL(url).host} returned ${r.status}`);
  const text = await r.text();
  return { text: text.slice(0, max), url: r.url };
}

const norm = (h) => {
  let x = h.toLowerCase();
  if (x.length === 4) x = `#${x[1]}${x[1]}${x[2]}${x[2]}${x[3]}${x[3]}`;
  return x;
};
const lum = (c) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const sat = (c) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};
const attr = (tag, name) => new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1] ?? null;
const decode = (s) => String(s ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const textOf = (html) => decode(String(html).replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '));

/** Pure analysis of a page and its CSS (exported for tests). */
export function analyse(html, css = '', baseUrl = 'https://example.com/') {
  const evidence = [];
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (key) => { const t = metas.find((m) => new RegExp(`(name|property)\\s*=\\s*["']${key}["']`, 'i').test(m)); return t ? decode(attr(t, 'content')) : null; };
  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
  const siteName = meta('og:site_name') ?? title.split(/\s+[|\-–—:·]\s+/)[0] ?? '';
  const description = meta('description') ?? meta('og:description');

  // Colours: theme-color, CSS custom properties, body/html declarations, then frequency.
  const allCss = `${css}\n${[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')}\n${[...html.matchAll(/style\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(';')}`;
  const counts = {};
  for (const m of allCss.matchAll(HEX6)) { const c = norm(m[0]); counts[c] = (counts[c] ?? 0) + 1; }
  const vars = {};
  for (const m of allCss.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,6})\b/gi)) vars[m[1].toLowerCase()] = norm(m[2]);
  const pickVar = (re) => Object.entries(vars).find(([k]) => re.test(k))?.[1] ?? null;
  const bodyRule = /(?:^|[}\s,])(?:html|body)\s*\{([^}]*)\}/i.exec(allCss)?.[1] ?? '';
  const bodyBg = norm(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,6})/i.exec(bodyRule)?.[1] ?? '#000000');
  const bodyText = /(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,6})/i.exec(bodyRule)?.[1];
  const themeColor = meta('theme-color');
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const bg = pickVar(/^(bg|background|color-bg|surface-0|base|canvas)/) ?? (bodyRule && /background/i.test(bodyRule) ? bodyBg : null) ?? ranked.find((c) => lum(c) > 0.85) ?? null;
  const text = pickVar(/^(text|fg|foreground|ink|color-text)/) ?? (bodyText ? norm(bodyText) : null) ?? ranked.find((c) => lum(c) < 0.08) ?? null;
  const accent = pickVar(/^(accent|primary|brand|color-primary|color-accent)/) ?? (themeColor && HEX6.test(themeColor) ? norm(themeColor.match(HEX6)[0]) : null) ?? ranked.find((c) => sat(c) > 0.35 && lum(c) > 0.05 && lum(c) < 0.8) ?? null;
  const accent2 = ranked.find((c) => c !== accent && sat(c) > 0.2 && lum(c) > 0.1 && lum(c) < 0.9) ?? null;
  if (Object.keys(vars).length) evidence.push(`CSS variables: ${Object.entries(vars).slice(0, 8).map(([k, v]) => `--${k} ${v}`).join(', ')}`);
  if (ranked.length) evidence.push(`Most used colours: ${ranked.slice(0, 6).join(', ')}`);

  // Fonts: Google Fonts links first, then font-family declarations.
  const gf = [...html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/gi)].flatMap((m) => [...m[1].matchAll(/family=([^:&]+)/g)].map((f) => decodeURIComponent(f[1]).replace(/\+/g, ' ')));
  const fams = [...allCss.matchAll(/font-family\s*:\s*([^;}]+)/gi)].map((m) => m[1].split(',')[0].replace(/["']/g, '').trim()).filter((f) => f && !/^(var\(|inherit|system-ui|sans-serif|serif|monospace|-apple-system)/i.test(f));
  const fontRank = {};
  for (const f of [...gf, ...fams]) fontRank[f] = (fontRank[f] ?? 0) + 1;
  const fonts = Object.entries(fontRank).sort((a, b) => b[1] - a[1]).map(([f]) => f);
  const headingFont = /h1[^{]*\{[^}]*font-family\s*:\s*([^;}]+)/i.exec(allCss)?.[1]?.split(',')[0].replace(/["']/g, '').trim();
  if (gf.length) evidence.push(`Google Fonts: ${[...new Set(gf)].join(', ')}`);

  // Logo: SVG or image named like a logo, then icons.
  const abs = (u) => { try { return new URL(decode(u), baseUrl).href; } catch { return null; } };
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const logoImg = imgs.find((t) => /logo|wordmark|brand/i.test(`${attr(t, 'class') ?? ''} ${attr(t, 'alt') ?? ''} ${attr(t, 'src') ?? ''}`));
  const icons = [...html.matchAll(/<link\b[^>]*rel\s*=\s*["'][^"']*(icon|apple-touch-icon)[^"']*["'][^>]*>/gi)].map((m) => abs(attr(m[0], 'href'))).filter(Boolean);
  const logoUrl = logoImg ? abs(attr(logoImg, 'src')) : null;
  const inlineSvgLogo = /<a[^>]*(?:class|aria-label)\s*=\s*["'][^"']*(?:logo|brand|home)[^"']*["'][^>]*>\s*(<svg[\s\S]*?<\/svg>)/i.exec(html)?.[1] ?? null;

  // Wordmark: how the brand writes its own name on its own site.
  const name = siteName || title;
  const markText = decode(logoImg ? attr(logoImg, 'alt') ?? '' : '') || name;
  const wordmark = name ? { text: markText || name, case: markText && markText === markText.toLowerCase() && /[a-z]/.test(markText) ? 'lower' : markText && markText === markText.toUpperCase() && /[A-Z]/.test(markText) ? 'upper' : 'as-is' } : null;

  // Copy samples for the AI to read the voice (Quint AI does not label voice itself).
  const h1 = textOf(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? '');
  const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => textOf(m[1])).filter(Boolean).slice(0, 4);
  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => textOf(m[1])).filter((t) => t.length > 40).slice(0, 4);

  const palette = Object.fromEntries(Object.entries({ bg, text, accent, accent2 }).filter(([, v]) => v));
  return {
    profile: {
      brand: name || undefined,
      ...(Object.keys(palette).length || fonts.length ? { brandStyle: {
        ...(bg ? { mode: lum(bg) > 0.45 ? 'light' : 'dark' } : {}),
        ...(Object.keys(palette).length ? { palette } : {}),
        ...(fonts.length ? { fontDisplay: headingFont && fontRank[headingFont] ? headingFont : fonts[0], fontBody: fonts[1] ?? fonts[0] } : {}),
        ...(wordmark ? { wordmark: inlineSvgLogo && inlineSvgLogo.length < 20000 && !/<script|on\w+\s*=/i.test(inlineSvgLogo) ? { svg: inlineSvgLogo } : wordmark } : {}),
      } } : {}),
      ...(logoUrl ? { logoUrl } : {}),
      ...(description ? { positioning: { is: description.slice(0, 200) } } : {}),
    },
    samples: { title, h1, headings: h2s, paragraphs: paras },
    icons: icons.slice(0, 3),
    evidence,
  };
}

/** Fetch a site (and up to 3 of its own stylesheets) and analyse it. */
export async function extractBrand(url) {
  const page = await get(url);
  const sheets = [...page.text.matchAll(/<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi)].map((m) => attr(m[0], 'href')).filter(Boolean)
    .map((h) => { try { return new URL(h, page.url).href; } catch { return null; } }).filter((h) => h && new URL(h).host === new URL(page.url).host).slice(0, 3);
  const css = (await Promise.all(sheets.map((h) => get(h, 10000, 400_000).then((r) => r.text).catch(() => '')))).join('\n');
  return { url: page.url, ...analyse(page.text, css, page.url) };
}
