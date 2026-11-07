# Changelog

## Unreleased (after 0.7.0)

- **AI illustrations made by Quint AI (`illustrate` action "generate", Pro and above):** the best model for each job (cheap drafts for style previews, a premium model for finals with a transparent background, a fallback model), a quality check on every final with one free automatic redo, saved to the brand so pages and kits use them. `regenerate` makes a new version a seller asks for. Free plans, and any time generation is unavailable, get the free prompts instead.
- **AI video (`video`, Studio and Business):** 4 or 8-second clips animated from an approved illustration or photo; failed videos are refunded; kept 90 days.
- **Credits (cloud):** generation stops at the content limit or credits, whichever comes first, and nobody is charged extra. Costs are fixed and can be quoted first. AI images and video can be switched off (video starts off); landing page images keep working but still use credits.
- **Studio plan and top-ups (cloud):** Studio adds 60 images and 15 videos a month; one-off packs of 20 images or 5 videos. Allowances and a daily spending cap protect costs.
- **Retention (cloud):** a daily cleanup removes expired kits, ended campaigns, idle Free pages (after an email warning), old analytics, old issues, generated art after a plan lapses and videos after 90 days.

- **One go (`campaign_go`):** brand (saved profile or its website), plan, illustrations to make, landing page, content kit (offer or content-only), checks and private review links from one request. Nothing goes public until the seller approves.
- **Brand understanding (`brand_extract`):** reads the brand's own website for palette (CSS variables and usage), heading and body fonts, wordmark case or SVG logotype, logo, a positioning line and copy samples, each with evidence; saves after the seller confirms.
- **Illustrations without Figma (`illustrate`):** three style options; ready prompts for the AI's own image tool built from the accepted recipe (palette locked to hex, flat background for a clean cut-out, avoid list, audience); scene templates per niche; acceptance checks; `register` turns generated images into transparent cut-outs locally (rembg), uploads them and saves them with a style reference for consistency. Pages and kits lay them out frameless.
- **Brand assets (`asset_upload`):** logos, wordmark SVGs, illustrations, photos and web fonts hosted on every plan (small Free quota); SVGs with scripts are refused.
- **Motifs by category:** joining lines and arches for relationship and app brands, steam for food, motion lines for fitness and footwear, stitching for fashion, interface fragments for software and more, stable per brand.
- **Story page design:** an art-directed page composed per brand from signature sections (centred hero with frameless art, a statement with a thread that draws as you scroll, illustrated moments, a promise band, a journey that fills, centred offer cards, a giant wordmark footer). Used when the AI passes story content; sections without real content are left out.
- **Motion:** every kit post can preview its motion and download a 6-second video (MP4 where the browser supports it, otherwise WebM) for Reels, TikTok and Status, rendered in the browser.
- **Wordmark everywhere:** page navigation and a giant wordmark footer; centred offer blocks on every page style.
- **Dashboard:** site map with role and status, and Unpublish buttons for pages and kits; issues page shows the first-pass check rate and how many issues the engine caught versus people.
- **Regression suite:** every field-log issue is a stored case re-run on every test; `scripts/import-issues.mjs` turns the issues export into new cases.
- **Questions:** Quint AI blocks only when it cannot tell what is sold; a reasonable guess proceeds and says what it assumed.

## 0.7.0 (2026-11-04)

Trust and control: no wrong content, nothing orphaned, problems caught before a seller sees them. Built from a full-day field test.

- **Content-only mode:** with no offer, kits make everyday posts only: no sale posts, no prices (saved prices stay hidden), no stickers, no "offer" badges, and no question about prices. `mode: "content"` or `offer: "none"` makes it explicit.
- **Your words on the graphic:** a post's `hook` or `headline` is drawn on the image, not only in the caption; `title` and `format` are kept; posts can be removed (`remove`, `posts[].remove`) and reordered (`order`).
- **`kit_edit`:** change a shared kit at the same link: remove, reorder, replace or add posts, change settings.
- **`unpublish`:** take a page or kit offline immediately.
- **Page roles:** `publish_page` takes `role` (home, campaign, product, legal, review) and `endsAt`. Review pages are private, not indexed and don't use a page slot. The home page links live campaigns automatically; ended campaigns say so, then redirect home after 7 days. `cloud_account pages` returns a site map with role, status and reachability.
- **Automatic checks (`checks` in every page and kit result):** leaked markup, double-escaped entities, empty values, retail wording for non-retail offers, placeholders, raw product text as headings, repeated brand names, prices or offer wording without an offer, avoided words, unrequested locations, palette not applied, UTC deadlines. `publish_page` refuses a failing page unless `force` is set. When connected, issues are filed automatically (arguments and the failing snippet only; `reportIssues: false` turns it off).
- **`report_issue`, a feedback button and an issues page:** the AI files the seller's complaint in their words; each post on a hosted kit has a "Something's wrong" button; `quintai.erasstack.com/dashboard/issues` groups reports by rule with counts, versions and examples (JSON export).
- **Brand positioning:** `positioning` (is / isNot), `avoidWords`, `alwaysSay`, `noLocationMentions` in `brand_profile`, `landing_page` and `content_kit`; hooks that use an avoided word are never dealt.
- **Wordmark:** `brandStyle.wordmark` (text, case, weight, letter spacing, accent letters, or an SVG) is used as written and never re-cased.
- **Sentence case:** headlines are no longer forced into capitals.
- **Frameless art:** SVG and PNG illustrations are shown whole, with no white card behind them, in kits and pages.
- **Pages:** the editorial hero, section headings and price cards are centred; light brands get a calm button with readable text instead of a hard offset shadow; white text on the accent whenever it is readable.
- **Copy fallbacks are plain and factual:** no invented claims ("our best saving", "biggest offer of the year"), no "For a limited time only" without an offer, no filler features, and the button uses the offer type's verb. `landing_page` reports which parts used fallback copy (`fallbacks`) so the AI can write them. The scroll statement appears only when `statement` is given. Gallery captions are never assigned to photos by position.
- **Briefs are filled in:** `asset_brief` returns a written video script (shot, on-screen text and voiceover per beat), a real image prompt with the brand palette, and an email outline built from the actual products or plans. Customer quotes are never written for you.
- **Images:** keyless search drops results that don't match what was asked for and says so when nothing fits; credits are decoded and short.
- **Events and trends:** `event_calendar` puts events celebrated in the chosen place first and marks other markets' events `lowRelevance`; `whats_on` lists `use` (safe and relevant), `safeButUnrelated` and `nothingFitsToday`.
- **Fixes:** `publish_page` with `page` applies the saved brand profile; `nextCalls` deadlines use the audience's time zone; the kit note states the real expiry date; the brand profile rejects unknown fields and reports shortened text (`warnings`); plain "app" is recognised as a consumer app.

## 0.6.0 (2026-11-03)

- **Designed posts, not boxes:** mood and scene photos fill the whole post (full bleed) with a soft gradient so text stays readable; product photos show the whole product on a clean panel (no cropping); posts without photos lead with the offer in the brand's display font.
- **Vector elements from the brand:** each brand gets one consistent decoration style (rings, dot grid, arc or diagonal lines) drawn in its accent colour; information is designed in: a discount sticker on product posts, an end-date chip with a clock icon, and feature chips with check icons (`features`, up to 3 real facts).
- **Premium review page:** icon actions (download, copy, WhatsApp, X, Facebook, LinkedIn, Telegram), app tabs with icons, a single Share action, a slim sticky header with Download all, all in the brand's colours and fonts.
- **Copy:** story buttons follow the offer type ("Tap the link to start your plan", "Tap to order on WhatsApp"); more retail-only lines are kept away from apps, courses and services.

## 0.5.0 (2026-11-03)

Built from a real field test: Quint AI now works from the brand's own information instead of fixed templates.

- **Brand look wins:** pages, kit graphics and the kit review page accept `brandStyle` (light or dark mode; palette: bg, surface, text, muted, accent, accent2; heading and body fonts). An event theme only adds its label. Text contrast is checked and corrected. A saved `brand_profile` fills it in automatically. Brand colours and fonts work on every plan; only the logo on graphics is Pro.
- **The right verbs for what is sold:** `offerType` (physical, subscription, course, service, digital) drives calls to action, captions and hooks: "Start your plan" for apps, "Enrol" for courses, "Book" for services. Retail lines ("If it was in your cart", "Reply to this message to order") never reach non-physical offers.
- **New niche:** consumer apps and subscriptions. When Quint AI is not sure what is sold, it asks instead of guessing (`canProceed: false`).
- **Readable names:** `displayName` (or the brand) is used in copy; long raw product phrases are never pasted into hooks or headings. Eyebrows never repeat the brand.
- **The AI's words win:** `posts[].hook` or `headline` replaces a kit post's default hook and the captions built on it.
- **Kits live through the campaign:** hosted kits stay up until the offer deadline plus a day (up to 60 days).
- **Guardrail:** whenever a discount is set, a reminder to make sure the checkout really charges the advertised price.
- **Fixes:** `productPhotos: "none"` is respected; digital products are asked for screenshots, not product photos; local output folders are created; hashtags are not made from long phrases; `nextCalls` uses the real tool name; the plan's Markdown header no longer says "undefined"; scroll-effect attributes no longer contain a raw ">".

## 0.4.1 (2026-11-03)

- **Better photo matches:** photos are ranked by whether the product is the main subject (first tags), then by requested details such as colour, from a wider pool of results.
- **Representative photos must be the same kind of product:** a "Street Slide" only gets a slide or sandal photo, a boot only a boot; product photos with people as the subject are skipped; ambiguous words ("slide", "heel") no longer match unrelated photos. When nothing fits, the post uses the type-led layout instead of a wrong picture.
- **Broader retry:** very specific searches that find nothing retry once with just the product type.

## 0.4.0 (2026-11-03)

- **Connect without copying keys:** `cloud_account` action `connect` shows a link and code; the user approves in the browser and the key is saved locally. No config edits, no restart.
- **Dashboard link:** `cloud_account` action `dashboard`; `page_stats` results include it.
- **Currency by country:** upgrade links are priced in Naira in Nigeria and US Dollars elsewhere, decided by the server.
- **Phone and tablet layouts:** the opening section of every sales page is laid out top to bottom under 900px (headline, product, price, countdown, full-width button); stickers stay on the product, nothing overlaps; desktop keeps the scroll-linked scene.
- **Content kits:** new `content_kit` tool. Finished graphics at real platform sizes (4:5 post, 1:1 product spotlights, carousel, 9:16 Story/Status, last call, 16:9 card) with captions per app, on a review page with Share (phone share sheet with the image attached), share links, copy caption and PNG download. Hosted at a link when connected (Free 7 days with a small mark, Pro 90 days without); a local HTML file otherwise.
- **Brand profile:** new `brand_profile` tool saves voice, products, order link, logo and colours once; kits reuse them. Logo and colours on graphics are a Pro feature.
- **Sales results drive the plan:** when connected, `content_plan` features the products with the most WhatsApp order taps in selling posts (`featured`, `salesSignals`).
- **Hook library:** 89 phase-aware hooks plus niche lines; no hook repeats within a plan, no discount or event claims when none was given, no unverifiable "lowest price" lines.
- **Photos are decided in the chat:** before making a kit, the assistant asks once whether to use the seller's photos, representative photos (tagged on the graphic), created images, or no photos. Products are never drawn or faked. Mood posts use licensed photos whose description names the product type and shows no other brand, or a type-led design. Photos can be changed any time by asking the assistant; the kit updates at the same link (`kitId`).
- **Studio photos, free and local:** new `studio_photo` tool runs on the seller's computer: fixes colour and sharpness, removes the background (with rembg) and places the product on a studio colour or a full scene photo with a soft shadow.
- **When to ask:** `content_kit` returns `askUser` (at most 3, one message) only for things that would otherwise be invented: product photos, real prices, the order link, and currency. Everything else is a stated assumption.
- **Captions per app:** Instagram, WhatsApp, X (always within 280 characters) and LinkedIn versions written from the seller's facts; "from" prices only when they are the true lowest.
- **Design pass:** one focal point per graphic (photo or offer statement), then price, then end date; statement type measured to fit the frame; even margins; sales page heroes no longer repeat the discount four times.

## 0.3.0 (2026-11-02): first public release

First version published to npm and GitHub Releases.

- **Cloud tools:** `publish_page` (live link at `quintai-<brand>.erasstack.com`), `page_stats` (views and WhatsApp order clicks per product), `connect_domain` (Pro, own domain with HTTPS), `cloud_account` (free key by email, plan status, Flutterwave upgrade links).
- **Product grid** on sales pages: items with real and previous prices; on WhatsApp shops each item opens a prefilled order chat.
- **Package:** ships as one self-contained file (`dist/server.mjs`) with no runtime dependencies, so `npx -y quint-ai-mcp` starts fast.

## 0.2.0 (internal, not published to npm)

- Year-round calendar (60+ events, January to December), Easter computed, lunar and religious dates from verified tables with moon-sighting notes.
- `start_campaign`: understands loose requests (platform aliases, cities, countries, continents, offers like "N5k off", deadlines like "ends nov 30"); questions never block.
- `whats_on`: live public holidays for 100+ countries (Nager.Date), daily search trends per country (Google Trends), world reading (Wikipedia), with a sensitivity filter.
- 15 niche profiles drive angles, hooks, shot lists, compliance and event relevance; email and WhatsApp cadence caps.
- `find_images`: free licensed photos (Pexels, Unsplash, Wikimedia Commons, Openverse) with attribution and logo filtering.
- Art director for sales pages: cinematic, split showcase, product stage and editorial layouts; scroll-linked motion; video scrubbing and 3D models; per-brand fonts, navigation, buttons, countdown, FAQ and ending styles; SEO title and structured data.
- Six skills for Claude Code and Codex: `campaign`, `plan`, `posts`, `visuals`, `landing`, `trends`.

## 0.1.0 (internal, not published)

- Q4 calendar, content plan, platform specs, asset briefs, holiday landing pages, CSV/ICS export.
