// Client for Quint AI Cloud (publishing, analytics, domains, billing).
// Key lookup order: QUINT_AI_API_KEY env, then the key saved by "connect" in
// ~/.quint-ai/credentials.json (QUINT_AI_HOME overrides the folder). QUINT_AI_API_URL overrides the host.
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const base = () => (process.env.QUINT_AI_API_URL || 'https://q4.erasstack.com').replace(/\/+$/, '');
const credFile = () => join(process.env.QUINT_AI_HOME || join(homedir(), '.quint-ai'), 'credentials.json');

export const NO_KEY = 'Not connected to Quint AI Cloud yet. Call cloud_account with action "connect": it returns a link and a code for the user to approve in their browser (about 30 seconds, free). Then call the same tool again.';

function readSaved() {
  try {
    const c = JSON.parse(readFileSync(credFile(), 'utf8'));
    return c.base === base() && typeof c.apiKey === 'string' ? c : null;
  } catch { return null; }
}

function save(apiKey, email) {
  const file = credFile();
  mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify({ base: base(), apiKey, email, savedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* Windows: user profile ACLs apply */ }
  return file;
}

/**
 * @param {{ persist?: boolean, client?: string }} opts persist: save the connected key to disk (local stdio
 * servers). The hosted HTTP server is stateless, so it cannot finish a connect between requests.
 */
export function createCloud({ persist = false, client: initialClient = 'AI app' } = {}) {
  let client = initialClient;
  let memKey = null;
  let pending = null; // { deviceToken, code, url, expiresAt, interval }
  let lastResult = null;

  const keyOf = () => key();
  const key = () => process.env.QUINT_AI_API_KEY || memKey || (persist ? readSaved()?.apiKey : null) || null;

  async function api(path, { method = 'GET', body, auth = true } = {}) {
    const k = key();
    if (auth && !k) throw new Error(NO_KEY);
    const res = await fetch(`${base()}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'user-agent': 'quint-ai-mcp', ...(auth ? { authorization: `Bearer ${k}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 202 && res.status !== 410) throw new Error(data.error ?? `Quint AI Cloud returned ${res.status}`);
    return { ...data, httpStatus: res.status };
  }
  const strip = ({ httpStatus, ...d }) => d;
  // Generation answers with 402/503 when the plan or the service cannot make it; those come back as data
  // (with fallback: "handoff") instead of an error, so the tool can switch to the free prompts.
  async function soft(path, { method = 'GET', body, timeout = 20000 } = {}) {
    const k = key();
    if (!k) throw new Error(NO_KEY);
    const res = await fetch(`${base()}${path}`, { method, headers: { 'content-type': 'application/json', 'user-agent': 'quint-ai-mcp', authorization: `Bearer ${k}` }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, ...data };
  }
  const call = async (...a) => strip(await api(...a));

  async function pollOnce() {
    if (!pending) return null;
    const r = await api('/v1/connect/poll', { method: 'POST', body: { deviceToken: pending.deviceToken }, auth: false });
    if (r.status === 'approved') {
      memKey = r.apiKey;
      const file = persist ? save(r.apiKey, r.email) : null;
      pending = null;
      lastResult = { connected: true, email: r.email, plan: r.plan, dashboard: r.dashboard, savedTo: file ?? undefined };
      return lastResult;
    }
    if (r.status === 'expired' || Date.now() > pending.expiresAt) { pending = null; return { connected: false, expired: true }; }
    return null;
  }

  // Keep checking in the background so the next tool call just works once the user approves.
  function watch() {
    const tick = async () => {
      if (!pending) return;
      try { if (await pollOnce()) return; } catch { /* network blip: try again */ }
      if (pending) setTimeout(tick, pending.interval * 1000).unref?.();
    };
    setTimeout(tick, (pending?.interval ?? 3) * 1000).unref?.();
  }

  return {
    hasKey: () => !!key(),
    /** Shown on the approval page, e.g. "claude-code" or "codex". */
    clientName: (n) => { client = String(n).slice(0, 40); },

    /** Start (or check) the browser approval that links this AI app to a Quint AI account. */
    async connect() {
      if (key() && !pending) {
        const me = await call('/v1/me').catch(() => null);
        if (me) return { connected: true, email: me.email, plan: me.plan, dashboard: `${base()}/dashboard`, ...(lastResult?.savedTo ? { savedTo: lastResult.savedTo } : {}) };
      }
      if (!persist) {
        throw new Error(`This hosted Quint AI server cannot store a key between requests. Sign in at ${base()}/dashboard, create an API key, and add it to this connector's settings as QUINT_AI_API_KEY, or run Quint AI locally (npx quint-ai-mcp) where "connect" works in one step.`);
      }
      if (pending) {
        const done = await pollOnce();
        if (done?.connected) return done;
        if (!done?.expired && pending) return { connected: false, waiting: true, url: pending.url, code: pending.code, message: `Still waiting. Ask the user to open ${pending.url}, check the code ${pending.code} matches, confirm their email and press Approve.` };
      }
      const r = await call('/v1/connect/start', { method: 'POST', body: { client }, auth: false });
      pending = { deviceToken: r.deviceToken, code: r.code, url: r.url, interval: r.interval ?? 3, expiresAt: Date.now() + (r.expiresIn ?? 600) * 1000 };
      watch();
      return {
        connected: false, url: r.url, code: r.code, expiresInMinutes: Math.round((r.expiresIn ?? 600) / 60),
        message: `Show the user this link and code: open ${r.url} and check the code ${r.code} matches. They confirm their email (new users get a free account) and press Approve. Then call cloud_account with action "connect" again to finish. Never ask for a password or card in chat.`,
      };
    },

    signup: (email) => call('/v1/signup', { method: 'POST', body: { email }, auth: false }),
    me: () => call('/v1/me'),
    publish: (b) => call('/v1/pages', { method: 'POST', body: b }),
    kit: (b) => call('/v1/kits', { method: 'POST', body: b }),
    updateKit: (id, b) => call(`/v1/kits/${id}`, { method: 'PUT', body: b }),
    async kitPhoto(id, key, buf, type) {
      const res = await fetch(`${base()}/v1/kits/${id}/photos/${key}`, { method: 'PUT', headers: { authorization: `Bearer ${keyOf()}`, 'content-type': type, 'user-agent': 'quint-ai-mcp' }, body: buf, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `upload ${res.status}`);
      return true;
    },
    brand: () => call('/v1/brand'),
    reportIssues: (b) => call('/v1/issues', { method: 'POST', body: b }),
    countRun: (tool, passed) => call('/v1/metrics', { method: 'POST', body: { tool, passed } }),
    getKit: (id) => call(`/v1/kits/${id}`),
    async uploadAsset(buf, type, name) {
      const res = await fetch(`${base()}/v1/assets${name ? `?name=${encodeURIComponent(name)}` : ''}`, { method: 'POST', headers: { authorization: `Bearer ${keyOf()}`, 'content-type': type, 'user-agent': 'quint-ai-mcp' }, body: buf, signal: AbortSignal.timeout(60000) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `upload ${res.status}`);
      return data;
    },
    deleteKit: (id) => call(`/v1/kits/${id}`, { method: 'DELETE' }),
    genImage: (b) => soft('/v1/generate/image', { method: 'POST', body: b, timeout: 180000 }),
    videoStart: (b) => soft('/v1/generate/video', { method: 'POST', body: b, timeout: 60000 }),
    videoStatus: (id) => soft(`/v1/generate/video/${encodeURIComponent(id)}`, { timeout: 120000 }),
    usage: () => call('/v1/usage'),
    genQuote: (b) => call('/v1/generate/quote', { method: 'POST', body: b }),
    genSettings: (b) => call('/v1/generate/settings', b ? { method: 'PUT', body: b } : {}),
    images: (q, o = {}) => call(`/v1/images?q=${encodeURIComponent(q)}&count=${o.count ?? 15}${o.orientation ? `&orientation=${o.orientation === 'squarish' ? 'square' : o.orientation}` : ''}`),
    saveBrand: (profile) => call('/v1/brand', { method: 'PUT', body: { profile } }),
    pages: () => call('/v1/pages'),
    remove: (id) => call(`/v1/pages/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    stats: (days) => call(`/v1/stats?days=${Number(days) || 30}`),
    connectDomain: (hostname, site) => call('/v1/domains', { method: 'POST', body: { hostname, site } }),
    domainStatus: (hostname) => call(`/v1/domains/${encodeURIComponent(hostname)}`),
    // currency omitted: the server picks Naira in Nigeria, US Dollars elsewhere.
    checkout: (plan, currency) => call('/v1/billing/checkout', { method: 'POST', body: { plan, ...(currency ? { currency } : {}) } }),
    dashboardUrl: () => `${base()}/dashboard`,
    pricingUrl: () => base(),
  };
}
