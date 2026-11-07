# Launch drafts

Repo: https://github.com/phestplus/quint-ai-mcp
Site: https://phestplus.github.io/quint-ai-mcp/

---

## LinkedIn

I built a marketing engine for AI assistants, and it is free.

Most small businesses ask ChatGPT or Claude for "Black Friday content" and get generic captions, wrong dates and a plan that ignores where their customers actually live.

Quint AI fixes the parts AI guesses:

→ Understands messy requests: "i sell sneakers in lagos, need bf content for ig and whatsapp, 25 percent off"
→ Knows the dates that matter in your country, all year: Ramadan and Eid, Mothering Sunday, Easter, back to school, Black Friday, Christmas, plus live public holidays for 100+ countries
→ Checks what people are searching today, and flags topics a brand should never touch
→ Plans content by campaign phase, caps email and WhatsApp so customers do not unsubscribe
→ Builds a sales page around the product: 3D product that spins as you scroll, product grid, "Order on WhatsApp" on every item

It never invents reviews, prices or stock counts.

Works in Claude, ChatGPT, Codex and Cursor. Open source.

Link in the first comment. If you sell anything online, try it on your next promo and tell me what breaks.

#AI #Marketing #SmallBusiness #Ecommerce #MCP

---

## X (thread)

1/ I built Quint AI: an MCP server that turns "i sell sneakers in lagos, need bf content for ig" into a full campaign. Free, open source. Works in Claude, ChatGPT, Codex.

2/ It knows the calendar for 100+ countries, all year. Easter is computed, Eid and Ramadan come with "±1 day, moon sighting" notes, and official public holidays are pulled live (it caught UK Boxing Day moving to Monday 28 Dec).

3/ It checks today's search trends per country and flags anything brands must not touch: crashes, deaths, disasters.

4/ Sales pages are art-directed from the product: a 3D shoe that spins as you scroll, a split showcase for fashion, cinematic scenes for cars. Every item can be ordered on WhatsApp.

5/ No fake reviews, no fake "was" prices, no countdowns that reset. Repo: https://github.com/phestplus/quint-ai-mcp

---

## Hacker News

**Title:** Show HN: Quint AI, an MCP server that gives AI assistants a real marketing calendar

**Text:**

Quint AI is an MCP server (plus Claude Code and Codex plugins) for small sellers who use AI for marketing. The problem it solves: assistants guess dates, ignore the seller's country, write generic content and produce landing pages that all look the same.

What it does:

- `start_campaign` parses loose requests (platform aliases, cities, continents, "N5k off", "ends nov 30") and returns assumptions plus at most 3 non-blocking questions.
- A year-round event calendar computed by rule (Easter via the Gregorian algorithm, nth-weekday holidays) or from verified tables for lunar/religious dates, ranked by relevance to the audience's countries and the business niche.
- Live data from Nager.Date (public holidays, 100+ countries), Google Trends daily RSS and Wikimedia pageviews, with a sensitivity filter.
- A content planner with campaign phases and per-channel cadence caps (email and WhatsApp are capped to avoid unsubscribes).
- A page generator with an "art director": the structure comes from the niche, the look is seeded per brand, motion is scroll-linked (pinned scenes, scrubbed transforms, video scrubbing, model-viewer orbit), with a WebGL2 fallback.

Plain Node, no runtime dependencies in the bundled server, 50 tests, MIT.

Feedback welcome, especially on the event data for countries I have not covered well.
