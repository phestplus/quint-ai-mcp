// page_design "story": an art-directed page composed from signature sections (report §10, log C3).
// Sections appear only when there is real content for them (no filler), focal content is centred,
// illustrations sit frameless on the page background, and the composition (section order, motif,
// motion pattern, hero arrangement) is seeded per brand so two brands never share a skeleton.
// Motion: a thread that draws as you scroll, a journey line that fills, gentle float on art.
// No default fade-in text. prefers-reduced-motion shows everything static.
import { wordmarkHtml } from './brand.js';
import { motifFor } from './motifs.js';

const seedOf = (s) => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
const isArt = (u) => /\.svg(\?|$)|\.png(\?|$)|^data:image\/(svg|png)/i.test(String(u ?? ''));

/**
 * @param {object} x { esc, o, t, c, cta, deadlineMs, deadlineLabel, priceHtml, clockHtml, faqHtml, title, jsonLd, nicheId, fontsHref, credits }
 */
export function renderStory(x) {
  const { esc, o, t, c, cta } = x;
  const seed = seedOf(o.brand);
  const art = (o.images ?? []).filter((im) => im?.url);
  const heroArt = o.heroImage ? { url: o.heroImage, alt: o.heroAlt } : art[0] ?? null;
  const moments = (o.moments ?? []).filter((m) => m?.title).slice(0, 3);
  const steps = (o.steps ?? []).filter((m) => m?.title).slice(0, 5);
  const products = (o.products ?? []).filter((p) => p?.name).slice(0, 4);
  const motif = motifFor(x.nicheId, o.brand, o.illustration?.motifs ?? o.motifs);
  const heroSplit = Boolean(heroArt) && seed % 2 === 1;
  const img = (im, cls) => (im ? `<img class="${cls}${isArt(im.url) ? ' art' : ' photo'}" src="${esc(im.url)}" alt="${esc(im.alt ?? '')}" loading="lazy">` : '');
  const btn = `<a class="sb" href="${esc(cta)}" data-cta>${esc(c.ctaText)}</a>`;

  const sections = {
    hero: `<header class="s-hero${heroSplit ? ' split' : ''}"><div class="s-hero-in">
      <p class="s-ey">${esc(x.eyebrow ?? o.brand)}</p><h1>${esc(c.headline)}</h1>${c.subheadline ? `<p class="s-lead">${esc(c.subheadline)}</p>` : ''}
      ${x.priceHtml ?? ''}${x.clockHtml ?? ''}<div class="s-cta">${btn}</div></div>
      ${heroArt ? `<div class="s-hero-art">${img(heroArt, 's-art float')}</div>` : `<div class="s-hero-motif" aria-hidden="true">${motif.svg}</div>`}</header>`,
    statement: o.statement ? `<section class="s-statement" data-thread><svg class="s-thread" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true"><path d="M0 250 C 260 250, 380 60, 600 60 S 940 250, 1200 250" pathLength="1"/><path d="M0 50 C 260 50, 380 240, 600 240 S 940 50, 1200 50" pathLength="1" class="b"/></svg><p>${esc(o.statement)}</p></section>` : '',
    moments: moments.length ? `<section class="s-moments">${o.momentsTitle ? `<h2 class="s-h2">${esc(o.momentsTitle)}</h2>` : ''}<div class="s-mgrid n${moments.length}">${moments.map((m, i) => `<article class="s-moment">${m.image ? img({ url: m.image, alt: m.alt ?? m.title }, `s-art${i % 2 ? ' float d' : ' float'}`) : ''}<h3>${esc(m.title)}</h3>${m.text ? `<p>${esc(m.text)}</p>` : ''}</article>`).join('')}</div></section>` : '',
    band: o.promise ? `<section class="s-band"><p>${esc(o.promise)}</p></section>` : '',
    journey: steps.length ? `<section class="s-journey" data-journey>${o.stepsTitle ? `<h2 class="s-h2">${esc(o.stepsTitle)}</h2>` : ''}<ol><span class="s-line" aria-hidden="true"><i></i></span>${steps.map((s2, i) => `<li><b>${String(i + 1).padStart(2, '0')}</b><h3>${esc(s2.title)}</h3>${s2.text ? `<p>${esc(s2.text)}</p>` : ''}</li>`).join('')}</ol></section>` : '',
    offer: products.length ? `<section class="s-offer">${o.gridTitle ? `<h2 class="s-h2">${esc(o.gridTitle)}</h2>` : ''}<div class="s-cards">${products.map((p) => `<article class="s-card">${p.image ? img({ url: p.image, alt: p.name }, 's-card-img') : ''}<h3>${esc(p.name)}</h3>${p.note ? `<p>${esc(p.note)}</p>` : ''}${p.price ? `<p class="s-price"><b>${esc(p.price)}</b>${p.originalPrice ? ` <s>${esc(p.originalPrice)}</s>` : ''}</p>` : ''}<a class="sb ghost" href="${esc(p.url ?? cta)}" data-cta>${esc(c.ctaText)}</a></article>`).join('')}</div></section>` : '',
    faq: x.faqHtml ?? '',
  };
  // Composition per brand: hero first and offer near the end; the middle is ordered by the seed.
  const middles = [['statement', 'moments', 'band', 'journey'], ['moments', 'statement', 'journey', 'band'], ['band', 'moments', 'journey', 'statement'], ['journey', 'moments', 'statement', 'band']];
  const order = ['hero', ...middles[seed % middles.length], 'offer', 'faq'];
  const main = order.map((k) => sections[k]).filter(Boolean).join('\n');

  const lightText = t.mode === 'light';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(x.title)}</title><meta name="description" content="${esc(c.subheadline || c.headline)}"><meta name="theme-color" content="${t.bg}">
<meta property="og:title" content="${esc(x.title)}"><meta property="og:description" content="${esc(c.subheadline || c.headline)}">${heroArt ? `<meta property="og:image" content="${esc(heroArt.url)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${x.fontsHref}&display=swap" rel="stylesheet">
${x.jsonLd ?? ''}
<style>
:root{--bg:${t.bg};--sf:${t.surface};--tx:${t.text};--mu:${t.muted};--ac:${t.accent};--ac2:${t.accent2};--at:${t.accentText};--bd:${t.border};--d:'${t.display}',Georgia,serif;--b:'${t.body}',system-ui,sans-serif;--e:cubic-bezier(.2,.7,.2,1)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--tx);font:400 17px/1.65 var(--b);-webkit-font-smoothing:antialiased;overflow-x:clip}
img{max-width:100%;display:block}h1,h2,h3{font-family:var(--d);font-weight:600;letter-spacing:-.02em;margin:0;text-wrap:balance}
.nav{display:flex;justify-content:center;padding:26px 20px}.nav .wm{font:700 24px/1 var(--d)}
.s-ey{display:inline-flex;margin:0 0 18px;padding:7px 14px;border-radius:999px;background:color-mix(in srgb,var(--ac) 12%,transparent);font:600 13px/1 var(--b);letter-spacing:.04em;color:var(--tx)}
.s-hero{max-width:1180px;margin:0 auto;padding:clamp(40px,8vw,96px) 20px clamp(48px,8vw,96px);text-align:center;display:grid;gap:clamp(32px,5vw,64px);justify-items:center;position:relative}
.s-hero-in{max-width:760px;display:flex;flex-direction:column;align-items:center}
.s-hero h1{font-size:clamp(40px,6.4vw,84px);line-height:1.02}.s-lead{margin:18px 0 0;font-size:clamp(18px,1.6vw,21px);color:var(--mu);max-width:34em}
@media(min-width:960px){.s-hero.split{grid-template-columns:1.05fr .95fr;text-align:left;align-items:center}.s-hero.split .s-hero-in{align-items:flex-start}}
.s-hero-art{width:min(100%,640px)}.s-hero-motif{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:-1}.s-hero-motif .deco{position:absolute;width:520px;height:520px;top:-60px;right:-120px;opacity:.9}
.s-cta{margin-top:30px;display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.sb{display:inline-flex;align-items:center;justify-content:center;min-height:54px;padding:0 28px;border-radius:999px;background:var(--ac);color:var(--at);font:600 16px var(--b);text-decoration:none;box-shadow:0 14px 30px -16px color-mix(in srgb,var(--ac) 80%,transparent);transition:transform .2s var(--e)}.sb:hover{transform:translateY(-2px)}
.sb.ghost{background:transparent;color:var(--tx);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--tx) 30%,transparent)}
.s-art{width:100%;height:auto;background:transparent}.s-art.photo{border-radius:28px}
.pr{display:flex;justify-content:center;align-items:baseline;gap:12px;margin:22px 0 0}.pr b{font:600 clamp(30px,3vw,40px)/1 var(--d)}.pr s{color:var(--mu)}.pr em{font-style:normal;font-size:13px;font-weight:700;padding:5px 11px;border-radius:999px;background:var(--ac);color:var(--at)}
.ck{margin:14px 0 0;color:var(--mu)}.ck b{color:var(--tx);font-variant-numeric:tabular-nums}
.s-h2{font-size:clamp(30px,4vw,52px);text-align:center;max-width:22ch;margin:0 auto 40px}
.s-statement{position:relative;max-width:1200px;margin:0 auto;padding:clamp(60px,10vw,120px) 20px;text-align:center}
.s-statement p{position:relative;font:600 clamp(28px,4.4vw,58px)/1.15 var(--d);letter-spacing:-.02em;max-width:20ch;margin:0 auto}
.s-thread{position:absolute;left:0;right:0;top:50%;width:100%;height:clamp(160px,22vw,300px);transform:translateY(-50%);overflow:visible}
.s-thread path{fill:none;stroke:var(--ac);stroke-width:2.5;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:calc(1 - var(--p,1));vector-effect:non-scaling-stroke}.s-thread .b{stroke:var(--ac2)}
.s-moments{max-width:1180px;margin:0 auto;padding:clamp(48px,8vw,96px) 20px}
.s-mgrid{display:grid;gap:clamp(28px,4vw,56px);justify-content:center}@media(min-width:860px){.s-mgrid.n2{grid-template-columns:repeat(2,minmax(0,440px))}.s-mgrid.n3{grid-template-columns:repeat(3,minmax(0,1fr))}}
.s-moment{text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px}.s-moment .s-art{max-width:360px}.s-moment h3{font-size:clamp(22px,2vw,28px)}.s-moment p{margin:0;color:var(--mu);max-width:28em}
.s-band{background:var(--tx);color:var(--bg);padding:clamp(64px,10vw,128px) 20px;text-align:center}.s-band p{font:600 clamp(28px,4.2vw,56px)/1.15 var(--d);letter-spacing:-.02em;max-width:22ch;margin:0 auto}
.s-journey{max-width:860px;margin:0 auto;padding:clamp(56px,9vw,112px) 20px}
.s-journey ol{position:relative;list-style:none;margin:0;padding:0 0 0 56px;display:grid;gap:36px}
.s-line{position:absolute;left:18px;top:6px;bottom:6px;width:3px;border-radius:3px;background:color-mix(in srgb,var(--tx) 12%,transparent)}.s-line i{position:absolute;inset:0;border-radius:3px;background:var(--ac);transform-origin:top;transform:scaleY(var(--p,1))}
.s-journey li{position:relative}.s-journey li b{position:absolute;left:-56px;top:0;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--bg);border:2px solid var(--ac);font:700 13px/1 var(--b)}.s-journey h3{font-size:24px}.s-journey p{margin:6px 0 0;color:var(--mu)}
.s-offer{max-width:1180px;margin:0 auto;padding:clamp(48px,8vw,96px) 20px}
.s-cards{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),340px));justify-content:center}
.s-card{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:30px 24px;border-radius:24px;background:var(--sf);border:1px solid var(--bd)}.s-card h3{font-size:24px}.s-card p{margin:0;color:var(--mu)}.s-price b{color:var(--tx);font:600 30px/1 var(--d)}.s-card-img{max-width:200px}
.faq{max-width:760px;margin:0 auto;padding:clamp(48px,8vw,96px) 20px}.faq h2{text-align:center;font-size:clamp(30px,4vw,48px);margin-bottom:28px}.faq details{border-bottom:1px solid var(--bd);padding:18px 0}.faq summary{cursor:pointer;font-weight:600;font-size:18px;list-style:none}.faq summary::after{content:'+';float:right;color:var(--ac)}.faq details[open] summary::after{content:'−'}.faq p{color:var(--mu)}
.ft-mark{padding:clamp(60px,10vw,140px) 16px 0;text-align:center;font:600 clamp(72px,17vw,260px)/.85 var(--d);letter-spacing:-.04em;color:color-mix(in srgb,var(--tx) 90%,var(--bg));overflow:hidden;white-space:nowrap}.ft-mark svg{height:clamp(72px,17vw,260px);width:auto;display:inline-block}
.ft{padding:36px 20px 120px;text-align:center;color:var(--mu);font-size:13px}
.float{animation:quintf 7s ease-in-out infinite}.float.d{animation-delay:-3.5s}@keyframes quintf{50%{transform:translateY(-10px)}}
@media(prefers-reduced-motion:reduce){.float{animation:none}.s-thread path{stroke-dashoffset:0}.s-line i{transform:none}}
</style></head>
<body${lightText ? ' class="m-light"' : ''}>
<nav class="nav">${wordmarkHtml(o)}</nav>
<main>
${main}
</main>
<div class="ft-mark" aria-hidden="true">${wordmarkHtml(o)}</div>
<footer class="ft">${x.terms ? `<p id="terms"><b>Offer terms.</b> ${esc(x.terms)}</p>` : ''}${x.credits ? `<p>${x.credits}</p>` : ''}<p>© ${new Date().getFullYear()} ${esc(o.brand)}</p></footer>
<script>
(function(){
var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduce)return;
var th=[].slice.call(document.querySelectorAll('[data-thread],[data-journey]'));
function prog(el){var r=el.getBoundingClientRect(),h=innerHeight;return Math.max(0,Math.min(1,(h-r.top)/(h*.6+r.height*.5)))}
var ticking=false;function run(){ticking=false;th.forEach(function(el){el.style.setProperty('--p',prog(el).toFixed(3))})}
th.forEach(function(el){el.style.setProperty('--p','0')});
addEventListener('scroll',function(){if(!ticking){ticking=true;requestAnimationFrame(run)}},{passive:true});addEventListener('resize',run);run();
${x.deadlineMs ? `var end=${x.deadlineMs};function tick(){var d=Math.max(0,end-Date.now()),s=Math.floor(d/1e3);var el=document.querySelector('[data-clock]');if(el)el.innerHTML=s?('Ends in <b>'+Math.floor(s/86400)+'d '+Math.floor(s%86400/3600)+'h '+Math.floor(s%3600/60)+'m</b>'):'This offer has ended.'}tick();setInterval(tick,30000);` : ''}
})();
</script>
</body></html>`;
}
