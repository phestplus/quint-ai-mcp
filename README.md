# Quint AI

**A marketing engine for creators and sellers, all year round.** Tell your AI assistant what you sell in plain words ("i sell sneakers in lagos, need bf content for ig and whatsapp") and Quint AI gives it what it needs to do the job properly: the dates that matter in your country, what people are searching today, a content plan that fits your product, posts and video scripts, free licensed photos, and a cinematic sales page built around your product.

Works with Claude (Code and Desktop), ChatGPT and Codex, or any MCP client.

Docs and examples: https://phestplus.github.io/quint-ai-mcp/ (mirror: https://quintai.erasstack.com/docs/)

## What it does

**Understands messy requests.** `start_campaign` reads whatever the user typed: platforms like "ig, tik tok, status", places like "Lagos", "the Gulf" or "West Africa", offers like "30 percent off" or "N5k off", deadlines like "ends nov 30". It says what it assumed and asks at most three questions, each with the default it will use. It only waits for an answer when it cannot tell what you sell, because the plan, posts and page all depend on that.

**Knows the calendar, all year.** 60+ curated events (Valentine's, Lunar New Year, Ramadan and Eid, Mothering Sunday and Mother's Day, Easter, Father's Day, back to school, Diwali, Black Friday, Christmas and more), computed by rule (Easter, Thanksgiving, Super Saturday) or verified tables (lunar and religious dates, with a note where moon sighting can shift a day). Plus live official public holidays for 100+ countries.

**Knows what is happening now.** `whats_on` pulls today's top searches per country (Google Trends), upcoming public holidays (Nager.Date) and what the world is reading (Wikipedia), flags sensitive topics brands must not use, and marks trends that fit the niche.

**Fits the business.** 15 niche profiles (footwear, fashion, beauty, jewellery, electronics, cars, home, food, fitness, courses, software, digital products, services, kids, general) drive the angles, hooks, shot lists, compliance rules and which events matter. A sneaker shop in Lagos gets Black Friday, Cyber Monday, Christmas and Boxing Day, not Diwali.

**Plans like a marketer.** Every slot belongs to a campaign phase (tease, warm-up, early access, launch, last chance, thank you). Launch days always get a post. Email and WhatsApp are capped so subscribers do not leave. Remembrance days get no sales content.

**Builds pages that do not look generated.** An art director picks the structure from the product: cinematic full-bleed scenes for cars and gadgets, a split showcase for fashion and food, a product stage for shoes and beauty, editorial for courses and software. Motion is scroll-linked (pinned scenes, scrubbed zoom, horizontal galleries, text that fills as you scroll). Fonts, navigation, buttons and countdown style vary per brand. Drop in a 3D model (.glb) and the product spins as you scroll; drop in a phone turntable video and scrolling plays it.

**Stays honest.** No invented reviews, prices, stock counts or results. Real "was" prices only. Countdowns that end. Ad disclosure, AI-image labels, music licensing, finance APR for cars, no cure claims for beauty: built into every brief.

## Tools

| Tool | What it does |
|---|---|
| `start_campaign` | Start here. Understands the request, ranks the events that matter, says what to post now, prefills the next calls. |
| `event_calendar` | Holidays, shopping days and observances for any dates and places. |
| `whats_on` | Live: today's searches, public holidays (100+ countries), world reading, with safety flags. |
| `content_plan` | Day-by-day plan per platform with phase, angle, hook, shot, format and size. |
| `asset_brief` | Brief for one post, image, carousel, story, video or email, with compliance checklist. |
| `platform_specs` | Sizes, limits, safe zones and cadence for 10 platforms including WhatsApp. |
| `find_images` | Free, commercially usable photos with licence and attribution; filters logos. |
| `landing_page` | Cinematic sales page from your product, photos, video or 3D model. |
| `export_plan` | CSV (Sheets, Notion, Airtable), ICS (Google, Apple, Outlook calendar) or Markdown. |
| `publish_page` | Puts the page online at `quintai-<brand>.erasstack.com` and returns the link to share. |
| `page_stats` | Views and WhatsApp order clicks per product. |
| `connect_domain` | Pro: serve pages on your own domain with automatic HTTPS. |
| `cloud_account` | Connect in one step (browser approval), plan status, dashboard link, and Flutterwave upgrade links. |
| `content_kit` | Finished graphics with captions (post, spotlights, carousel, Story/Status, X/LinkedIn) on a review page: share from the phone, copy captions, download PNGs. |
| `brand_profile` | Save voice, products, order link, logo and colours once; kits and pages reuse them. |
| `campaign_go` | The whole campaign in one go: brand, plan, illustrations to make, landing page, content kit, checks, private review links. |
| `brand_extract` | Read a brand's own website: palette, fonts, wordmark, logo, positioning and copy samples, with evidence. |
| `illustrate` | On-brand illustrations of people without Figma. Pro and above: Quint AI generates them (quality-checked, transparent, saved to the brand). Every plan: style options and ready prompts for the AI's own image tool, then transparent cut-outs. |
| `video` | Short AI videos (4 or 8 seconds) animated from an approved illustration or photo (Studio and Business). |
| `asset_upload` | Host the brand's logo, wordmark, illustrations and fonts (every plan). |
| `kit_edit` | Change a shared kit at the same link: remove, reorder, replace or add posts. |
| `unpublish` | Take a page or kit offline immediately. |
| `report_issue` | File the seller's complaint ("off-brand", "wrong image") with context, so nobody writes a report. |

Skills for Claude Code and Codex: `/quint-ai:campaign` (does everything), `/quint-ai:plan`, `/quint-ai:posts`, `/quint-ai:visuals`, `/quint-ai:landing`, `/quint-ai:trends`.

## Install

### Claude Code

```
/plugin marketplace add phestplus/quint-ai-mcp
/plugin install quint-ai@phestplus
```

Then type `/quint-ai:campaign` and describe your business.

### Codex

```
codex plugin marketplace add phestplus/quint-ai-mcp
```

Then install **Quint AI** from `/plugins`.

### Claude Desktop, Cursor, Windsurf, any MCP client

```json
{
  "mcpServers": {
    "quint-ai": { "command": "npx", "args": ["-y", "quint-ai-mcp"] }
  }
}
```

### ChatGPT (remote MCP)

ChatGPT connects to MCP servers over HTTPS. Host the HTTP server on any Node host (Render, Railway, Fly.io, a VPS), then add it under Settings → Apps & Connectors → Developer mode → Create, with the URL `https://your-host/mcp`.

```
npx -y quint-ai-mcp --http --port 3000
```

Health check: `GET /health`. In HTTP mode the server never writes files.

## Publish and measure (Quint AI Cloud)

`publish_page` puts a page online in seconds and returns a link like `https://quintai-korakicks.erasstack.com/black-friday`. `page_stats` shows views and WhatsApp order clicks per product.

**Connect in one step.** Say "connect my Quint AI account". Your assistant shows a link and a code; open the link, check the code matches, confirm your email and press Approve. The key is saved on your computer (`~/.quint-ai/credentials.json`), so there is nothing to paste and no restart. New emails get a free account.

Your dashboard at https://quintai.erasstack.com/dashboard shows views, WhatsApp taps per product, visitor countries and your plan. Sign in with your email; no password.

Prefer setting a key yourself (CI, hosted connectors)? Create one in the dashboard and add it to your MCP config:

```json
"env": { "QUINT_AI_API_KEY": "quint_..." }
```

| Plan | Price | Includes |
|---|---|---|
| Free | ₦0 / $0 | 1 site, 3 live pages, 7-day analytics, small badge |
| Pro | ₦9,900 a month in Nigeria, $9 elsewhere | Your own domain, no badge, 100 pages, 12-month analytics |
| Business | ₦60,000 a month in Nigeria, $39 elsewhere | 10 brands, 10 custom domains |

Payments are handled by Flutterwave's secure checkout. Pricing: https://quintai.erasstack.com

## Better photos (optional, free)

Without keys, photos come from Wikimedia Commons and Openverse: free and licensed, but mixed quality. For studio-quality stock photos, get a free key and set it in your MCP config's `env`:

- `PEXELS_API_KEY` from https://www.pexels.com/api/
- `UNSPLASH_ACCESS_KEY` from https://unsplash.com/developers

Stock photos are for mood and backgrounds. Show your own photos for the product you sell.

## Accuracy and limits

- Rule-based dates are tested across years. Lunar and religious dates use verified tables for 2026 to 2028; later years are left out, not guessed. Moon-sighted dates carry a note.
- Live sources can be slow or down; every tool still answers and reports which source failed.
- Platform specs carry a `lastReviewed` date; platforms change limits often.
- Shipping cutoffs are approximate. Compliance notes are guidance, not legal advice.
- 3D pages need WebGL2 (all current browsers); older devices see the product photo instead.

## Development

```
npm install
npm test          # 50 tests: dates, places, niches, plans, cadence, pages, MCP over stdio and HTTP
npm run build     # bundles dist/server.mjs (used by the plugins, no install needed)
npm start         # stdio
npm run start:http
```

## License

MIT © phestplus
