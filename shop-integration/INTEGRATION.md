# JX Motion shop — Parts Advisor (drop-in)

A native parts-advisor for the **Náhradné diely** section of `shop.jxmotion.sk`
(Next.js App Router + Sanity, Tailwind, dark theme). Customers search the full
Tillotson T4 price list (563 parts), get **grounded** results with **VAT prices**,
and build an **enquiry list** to send to Juraj. No new dependencies.

## Files → where they go in the shop repo

| This package | Drop into the shop as |
|---|---|
| `lib/parts-catalog.ts` | `lib/parts-catalog.ts` (pure search + grounding) |
| `data/catalog.json` | `data/catalog.json` (or `lib/`) — the catalog, 563 parts |
| `components/PartsAdvisor.tsx` | `components/PartsAdvisor.tsx` |
| `components/EnquiryDrawer.tsx` | `components/EnquiryDrawer.tsx` |
| `app/[lang]/products/poradca/page.tsx` | matches your locale routing → page at `/sk/products/poradca`, `/en/...` |
| `app/api/parts-advisor/route.ts` | `app/api/parts-advisor/route.ts` |

**Imports:** files use relative paths (`../lib/...`). Swap to your path alias
(`@/lib/...`, `@/components/...`) to match the repo's convention. The page's
`params` is awaited so it works on both Next 14 and 15.

## 1. Env var (the only secret)

In Vercel → Project → Settings → Environment Variables:
- `GROQ_API_KEY` = a free key from **console.groq.com** (no card).
- optional `GROQ_MODEL` (default `llama-3.3-70b-versatile` — check console.groq.com/docs/models).

The key stays server-side in the API route; it's never sent to the browser.
The route uses `export const runtime = "edge"` (fast/cheap on Vercel) — delete that
line if you prefer the Node runtime.

## 2. Design tokens

The UI uses your existing shadcn-style Tailwind classes, so it inherits the shop
theme automatically: `bg-background`, `bg-card`, `text-foreground`,
`text-muted-foreground`, `border-border`, `text-primary` / `bg-primary`,
`font-heading`, `font-sans`. Fonts **Unbounded** (headings) + **DM Sans** (body)
are already loaded by the shop.

If any token name differs, these are the values it expects:

| token | hex |
|---|---|
| background | `#0b0d14` |
| card / surface | `#101320` |
| foreground (text) | `#f5f6f8` |
| muted-foreground | `#9ca9bd` |
| border | `#1f2533` |
| primary (orange) | `#f26a22` |
| accent (gold) | `#f6b02e` |
| secondary (cyan) | `#00b6d3` |

A couple of accents use arbitrary values (`#00b6d3`, `#ffb066`) directly in the JSX.

## 3. Link it from the shop

Add a CTA to the **Náhradné diely** category page / nav, e.g.:
```tsx
<Link href={`/${lang}/products/poradca`} className="...">Poradca dielov</Link>
```

## 4. Enquiry channel

`components/EnquiryDrawer.tsx` → `CONTACT` (top of file): set Juraj's real
`email` and `whatsapp` (digits only, no `+`). "Send" opens a prefilled e-mail /
WhatsApp / copies the list. To route it through the shop's own contact form
instead, replace the `mailto:`/`wa.me` actions with a POST to your contact endpoint
(the `message` string is already built for you).

## 5. Updating prices

Catalog is generated from Juraj's 4 Excel files by `build_catalog.py` (on the
repo's `main` branch). When prices change: re-run it, then copy the new
`catalog.json` into `data/`. Prices in the file are **net**; the UI shows
`net × 1.23` as the headline (`s DPH`) with the net price beneath (`VAT` const in
`lib/parts-catalog.ts`).

## How "never invents" works

Deterministic search only ever returns real catalog rows. The AI advisor is
**retrieve-then-rerank**: the client narrows to ~30 real candidates, the route asks
Groq to pick from *only* those, and **both** the route (allow-list) and the client
(`groundPns`) validate every returned part number against the catalog — prices and
descriptions are rendered from `catalog.json`, never from the model. A hallucinated
part number simply disappears.

## Verify

```bash
npx tsx parts-catalog.test.ts        # search + grounding (incl. fake-PN dropped)
npx tsx parts-advisor.route.test.ts  # API route (stubbed Groq, no key needed)
```
Then in the shop: set `GROQ_API_KEY`, `npm run dev`, open `/sk/products/poradca`, and run:
`carb` → carburetors with € · `dážď` → Rain Shield · Mini+Engine filter · `FM19` →
exact match · ✨ Advisor on a sentence · add parts → **Dopyt** → Send. Confirm prices
show `s DPH` / `bez DPH` and it matches the shop's look.
