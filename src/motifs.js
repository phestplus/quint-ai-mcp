// Vector motifs that say something about the category (log feature request A): a relationship app,
// a sneaker shop and a bakery no longer share the same corner hatching. Each niche has a family;
// the brand name seeds the pick, so one brand looks consistent across page, kit and review page.
// Drawn in the brand accent (var(--ac)) with low opacity; decorative only (aria-hidden).

const S = (cls, vb, body) => `<svg class="deco ${cls}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const stroke = (w = 3, o = 0.45) => `style="fill:none;stroke:var(--ac);stroke-opacity:${o};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round"`;
const fill = (o = 0.14) => `style="fill:var(--ac);fill-opacity:${o}"`;

const M = {
  'joining-lines': S('m-corner', '0 0 600 600', `<path d="M40 520 C 180 420, 260 300, 300 300 S 420 180, 560 80" ${stroke(3)}/><path d="M40 560 C 200 480, 280 340, 300 300" ${stroke(2, 0.3)}/><circle cx="300" cy="300" r="10" ${fill(0.7)}/>`),
  'paired-circles': S('m-corner', '0 0 600 600', `<circle cx="250" cy="300" r="150" ${stroke(3)}/><circle cx="370" cy="300" r="150" ${stroke(3, 0.3)}/>`),
  arch: S('m-corner', '0 0 600 600', `<path d="M120 560 V 300 a 180 180 0 0 1 360 0 V 560" ${stroke(3)}/><path d="M180 560 V 310 a 120 120 0 0 1 240 0 V 560" ${stroke(2, 0.28)}/>`),
  steam: S('m-corner', '0 0 600 600', [140, 260, 380].map((x, i) => `<path d="M${x} 540 c -40 -60, 40 -120, 0 -180 s 40 -120, 0 -180" ${stroke(3, 0.4 - i * 0.06)}/>`).join('')),
  'motion-lines': S('m-corner', '0 0 600 600', [120, 200, 280, 360, 440].map((y, i) => `<path d="M${120 + i * 30} ${y} H 560" ${stroke(4, 0.42 - i * 0.05)}/>`).join('')),
  'rhythm-bars': S('m-corner', '0 0 600 600', [90, 180, 130, 240, 160, 210].map((h, i) => `<rect x="${110 + i * 70}" y="${420 - h}" width="34" height="${h}" rx="17" ${fill(0.16 + (i % 2) * 0.08)}/>`).join('')),
  stitching: S('m-corner', '0 0 600 600', `<path d="M60 500 C 200 300, 380 520, 560 120" style="fill:none;stroke:var(--ac);stroke-opacity:.5;stroke-width:4;stroke-dasharray:14 12;stroke-linecap:round"/>`),
  blobs: S('m-corner', '0 0 600 600', `<path d="M360 120c80 10 160 80 150 170s-90 150-180 140-150-80-130-170 80-150 160-140z" ${fill(0.16)}/><path d="M170 420l14 30 32 4-24 22 6 32-28-16-28 16 6-32-24-22 32-4z" ${fill(0.4)}/>`),
  'ui-fragments': S('m-corner', '0 0 600 600', `<rect x="200" y="120" width="320" height="200" rx="28" ${stroke(3)}/><rect x="240" y="170" width="150" height="16" rx="8" ${fill(0.3)}/><rect x="240" y="210" width="220" height="16" rx="8" ${fill(0.18)}/><rect x="120" y="360" width="240" height="120" rx="24" ${stroke(3, 0.3)}/>`),
  'rising-line': S('m-corner', '0 0 600 600', `<path d="M80 480 L 220 400 L 320 430 L 520 180" ${stroke(4)}/><path d="M470 180 H 520 V 230" ${stroke(4)}/>` + [0, 1, 2, 3].map((i) => `<path d="M80 ${200 + i * 80} H 540" ${stroke(1, 0.15)}/>`).join('')),
  droplets: S('m-corner', '0 0 600 600', `<path d="M380 120c50 80 90 130 90 180a90 90 0 0 1-180 0c0-50 40-100 90-180z" ${fill(0.16)}/><path d="M220 330c-60 0-110 60-110 130 70 0 120-50 120-120z" ${stroke(3)}/>`),
  'ruled-lines': S('m-corner', '0 0 600 600', [0, 1, 2, 3, 4, 5].map((i) => `<path d="M140 ${160 + i * 60} H 540" ${stroke(2, 0.3)}/>`).join('') + `<path d="M180 120 V 520" style="fill:none;stroke:var(--ac);stroke-opacity:.5;stroke-width:3"/>`),
  rings: S('m-corner', '0 0 600 600', [110, 170, 230, 290].map((r) => `<circle cx="300" cy="300" r="${r}" ${stroke(2, 0.38)}/>`).join('')),
  dots: S('m-corner', '0 0 420 420', `<defs><pattern id="quintdots" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="4" ${fill(0.4)}/></pattern></defs><rect width="420" height="420" style="fill:url(#quintdots)"/>`),
};

const FAMILIES = {
  apps: ['joining-lines', 'paired-circles', 'arch'],
  services: ['arch', 'paired-circles'],
  food: ['steam'],
  fitness: ['motion-lines', 'rhythm-bars'],
  footwear: ['motion-lines'],
  fashion: ['stitching'],
  kids: ['blobs'],
  software: ['ui-fragments', 'rising-line'],
  digital: ['ui-fragments'],
  beauty: ['droplets'],
  jewelry: ['droplets', 'rings'],
  courses: ['ruled-lines'],
  general: ['rings', 'dots'],
};

/** The motif for a niche and brand (stable per brand). Names come from brand_profile.illustration.motifs when set. */
export function motifFor(nicheId, brand = '', preferred = []) {
  const fam = (preferred ?? []).filter((m) => M[m]);
  const list = fam.length ? fam : FAMILIES[nicheId] ?? FAMILIES.general;
  const seed = [...String(brand)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return { name: list[seed % list.length], svg: M[list[seed % list.length]] };
}

export const MOTIF_CSS = '.m-corner{width:640px;height:640px;top:-200px;right:-200px}.g-story .m-corner{top:-120px}.g-wide .m-corner{width:560px;height:560px;top:-200px;right:-160px}';
