import { addDays } from './dates.js';

const COLUMNS = ['date', 'time', 'weekday', 'platform', 'format', 'size', 'kind', 'event', 'phase', 'objective', 'angle', 'cta', 'hashtags', 'caution', 'status'];

function csvCell(v) {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join(' ') : String(v);
  // Neutralize spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCSV(slots) {
  return [COLUMNS.join(','), ...slots.map((s) => COLUMNS.map((c) => csvCell(s[c])).join(','))].join('\r\n') + '\r\n';
}

function icsText(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545 line folding at 75 octets.
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // don't split UTF-8 sequences
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
  }
  return parts.join('\r\n ');
}

// Thirty minutes to post. No time zone on purpose: it shows at that clock time wherever the seller is.
const endOf = (t) => { const [h, m] = t.split(':').map(Number); const e = Math.min(h * 60 + m + 30, 23 * 60 + 59); return `${String(Math.floor(e / 60)).padStart(2, '0')}${String(e % 60).padStart(2, '0')}`; };

export function toICS(slots, calName = 'Content plan') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//quint-ai//content plan//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsText(calName)}`];
  slots.forEach((s, i) => {
    const d = s.date.replace(/-/g, '');
    const next = addDays(s.date, 1).replace(/-/g, '');
    const title = `${s.platform} ${s.format}: ${s.event ?? s.phase}${s.event ? ` (${s.phase})` : ''}`;
    const desc = [`Objective: ${s.objective}`, `Angle: ${s.angle}`, `CTA: ${s.cta}`, s.size ? `Size: ${s.size} (${s.aspect})` : '', s.hashtags?.length ? `Hashtags: ${s.hashtags.join(' ')}` : '', s.caution ? `Caution: ${s.caution}` : ''].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${d}-${i}-${s.platform}@quint-ai`, `DTSTAMP:${stamp}`, ...(s.time ? [`DTSTART:${d}T${s.time.replace(':', '')}00`, `DTEND:${d}T${endOf(s.time)}00`] : [`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`]), `SUMMARY:${icsText(title)}`, `DESCRIPTION:${icsText(desc)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function toMarkdown(plan) {
  const rows = plan.slots.map((s) => `| ${s.date} | ${s.time ?? '-'} | ${s.weekday.slice(0, 3)} | ${s.platform} | ${s.format} | ${s.event ?? '-'} | ${s.phase} | ${String(s.angle).replace(/\|/g, '/')} | ${s.cta} |`);
  return [
    `# Content plan: ${plan.brand}`,
    '',
    `${plan.window.start} → ${plan.window.end} · ${plan.platforms.join(', ')} · ${plan.postsPerWeekPerPlatform} posts/week/platform`,
    '',
    '## Key dates',
    ...plan.eventsCovered.map((e) => `- **${e.name}**: ${e.date} (start promoting ${e.promoStart})`),
    ...(plan.observances.length ? ['', '## Observances (no sales tie-ins)', ...plan.observances.map((e) => `- ${e.name}: ${e.date}`)] : []),
    '',
    '## Calendar',
    '| Date | Time | Day | Platform | Format | Event | Phase | Angle | CTA |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}
