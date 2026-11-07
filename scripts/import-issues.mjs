// Turn the dashboard's issues export (quint.erasstack.com/dashboard/issues.json) into regression cases.
// Usage: node scripts/import-issues.mjs issues.json   -> writes test/regression/imported-<date>.json
import { readFileSync, writeFileSync } from 'node:fs';
const { issues = [] } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const seen = new Set();
const cases = [];
for (const i of issues) {
  if (!i.args || !['content_kit', 'landing_page', 'publish_page'].includes(i.tool)) continue;
  let args; try { args = JSON.parse(i.args); } catch { continue; }
  const key = `${i.rule}|${JSON.stringify(args)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  cases.push({ name: `${i.rule} (${i.tool} ${i.version ?? ''})`.trim(), tool: i.tool === 'content_kit' ? 'kit' : 'page', args, ...(i.sample ? { mustNotInclude: [i.sample.slice(0, 40)] } : {}) });
}
const out = new URL(`../test/regression/imported-${new Date().toISOString().slice(0, 10)}.json`, import.meta.url);
writeFileSync(out, JSON.stringify(cases, null, 2));
console.log(`Wrote ${cases.length} cases to ${out.pathname}. Review them (remove customer data, use fictional brands) before committing.`);
