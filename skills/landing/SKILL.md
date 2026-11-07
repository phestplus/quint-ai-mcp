---
name: landing
description: Build a premium, ready-to-deploy sales page for any product and any season (sneakers, dresses, cars, skincare, courses, food and more) with scroll-linked cinematic motion, the seller's photos, video or 3D model, an honest countdown, pricing, FAQ, offer terms and SEO, then explain how to publish it. Use when the user asks for a sales page, promo page, offer page, product page or landing page.
---

# Sales page

## 1. Gather (ask once, never block)

Needed: brand and what is on sale. Everything else has a default.

Ask in one short message, and build anyway with what you have:
- The offer and price (and a real previous price, if any)
- When it ends (any form; convert to ISO with the local offset, e.g. `2026-11-30T23:59:00+01:00` for Lagos)
- Where people buy: checkout link, product page, or WhatsApp (`https://wa.me/<number>`)
- Media, best first: a 3D model (.glb), a 10 second turntable or walkaround video, a cut-out product photo, other product photos. Phone photos are fine.

## 2. Media decides the wow

- `modelUrl` (.glb): the product rotates as you scroll and can be dragged. Falls back to the photo on old devices.
- `videoUrl`: scroll scrubs through the video (a phone turntable or a car walkaround works).
- `productImage` / `images`: full-bleed scenes, split showcases and galleries.
- No media: free mood photos are fetched automatically. Say they are stock, and that the real product photos will look better. Mention that a free `PEXELS_API_KEY` gives far better stock photos.

## 3. Generate

Call `landing_page` with `brand`, `product`, the offer fields, `deadline` and `timeZone`, `ctaUrl`, the media, and `theme` if it is for a holiday (or `eventName` for others like "Eid" or "Mother's Day"). Pass `outputPath` when running locally.

The art director picks the structure from the product (cinematic, split showcase, product stage or editorial) and gives this brand its own fonts, navigation, buttons and countdown. If the user wants another look, call again with `variant: 1, 2, 3...` or set `archetype`.

Show the returned summary (layout, notes) and fix anything in `notes` (missing link, stock photos).

## 4. Publish

**Fastest:** call `publish_page` with the brand, a path (e.g. `black-friday`) and the HTML (or the same arguments as `page`). It returns a live link like `https://quint-korakicks.erasstack.com/black-friday` to share on WhatsApp, Status and Instagram bio. Without `QUINT_AI_API_KEY`, offer `cloud_account` action `signup` with their email first.

For a shop with several items, pass `products` (name, price, real previous price, photo): the page gets a product grid, and on WhatsApp shops every item opens a prefilled order chat.

Own domain and no badge: `cloud_account` action `upgrade` returns a Flutterwave checkout link (Pro ₦9,900 or $9 a month), then `connect_domain`.

Other options:

- **Netlify Drop**: drag the file onto app.netlify.com/drop, live in seconds
- **GitHub Pages**, **Vercel** or **Cloudflare Pages**: deploy the folder
- Or paste into a custom HTML block on their site builder

## Rules

- The countdown must match the real deadline; the page says "ended" afterwards.
- No fake reviews, "was" prices or stock levels.
- Stock photos set the mood; never present them as the seller's own product.
- Keep the photo credits in the footer.
