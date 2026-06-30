# Parts Advisor — Integration Guide (JX Motion shop)

A drop-in **spare-parts advisor** for the `shop.jxmotion.sk` Next.js + Sanity shop. It adds a
native page under the **Náhradné diely** section where a customer can search Juraj's full Tillotson
T4 price list (563 parts), get results with **VAT prices**, and build an **enquiry list** to send to
Juraj. No checkout (v1). No new npm dependencies.

> **The guarantee:** it can never show a part or price that isn't in the catalog. Deterministic
> search only returns real rows; the AI advisor is forced to pick from real candidates and every
> answer is validated twice against the catalog. See *How it works* below.

**Who does what:** *I (Samuel) will do the integration in the repo.* I just need a few things from
your side first — access, a couple of code/design specifics, and Juraj's contact details. The
checklist below is everything I need; the steps after it are what I'll then carry out myself.

---

## ✅ What I need from you (Juraj / the shop developer)

**Access**
- [ ] The shop's **Git repo** — clone URL + write access, or I open a PR from a fork. Tell me the default branch and your branch/PR convention.
- [ ] A **Vercel Preview** deployment on my branch/PR (so I can test on a real URL) — or temporary access to the Vercel project.

**To run & deploy it**
- [ ] How to run the shop locally: **Node version**, `npm install`, `npm run dev`.
- [ ] A working **`.env.local`** (or the list of required env vars + safe dev values): Sanity project/dataset/token, Clerk keys, and anything else the app needs to boot. *(Without this I can't run the shop to test.)*
- [ ] Add **`GROQ_API_KEY`** to the Vercel project env — I'll generate a free key at console.groq.com and send it, or you create one. Needed for the advisor in preview/prod.

**To match your code & theme**
- [ ] Your **import alias** (what `@/` maps to in `tsconfig`) and where `components/`, `lib/`, `data/` live.
- [ ] Confirm these **Tailwind tokens** exist (or just share `globals.css` + `tailwind.config`): `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-primary` / `bg-primary`, `font-heading`, `font-sans`. Confirm **Unbounded** (headings) + **DM Sans** (body).
- [ ] How **locale routing** works (the `[lang]` segment under `app/`), and whether I should use your i18n dictionary or the local SK/EN one I ship.

**To place it**
- [ ] Which file is the **Náhradné diely** category page, and your **nav/menu component** — so the "Poradca dielov" link goes in the right spot.
- [ ] Confirm the **route**: `/[lang]/products/poradca`, or tell me the path you'd prefer.

**Content**
- [ ] Juraj's real **e-mail** + **WhatsApp** number (digits only) for the enquiry "send".
- [ ] How the enquiry should be **delivered**: default mailto / WhatsApp / copy, or POST to your existing **contact endpoint** — if the latter, the endpoint URL + expected payload.

> Hand me those (the repo + `.env.local` are the two blockers; the rest I can fill in as I go), and
> I'll take it from there. Everything below is the work I'll do once I'm in the repo.

---

## TL;DR (what I'll do once I have the above)

1. Copy 7 files into the repo (table below) and fix the import paths to your `@/` alias.
2. Add `GROQ_API_KEY` to Vercel env (free key from console.groq.com).
3. Add a link to `/[lang]/products/poradca` from the Náhradné-diely page.
4. Set Juraj's email/WhatsApp in `EnquiryDrawer.tsx` (`CONTACT`).
5. `npm run dev` → open `/sk/products/poradca` → test.

---

## 1. Copy the files

| From this package | Into the shop repo |
|---|---|
| `lib/parts-catalog.ts` | `lib/parts-catalog.ts` — pure search + grounding (no React, no deps) |
| `data/catalog.json` | `data/catalog.json` — the catalog (563 parts; ~120 KB) |
| `components/PartsAdvisor.tsx` | `components/PartsAdvisor.tsx` — `"use client"` UI |
| `components/EnquiryDrawer.tsx` | `components/EnquiryDrawer.tsx` — enquiry list + send |
| `app/[lang]/products/poradca/page.tsx` | your locale route → serves `/sk/products/poradca` & `/en/...` |
| `app/api/parts-advisor/route.ts` | `app/api/parts-advisor/route.ts` — Groq proxy |

**Imports:** the files use **relative** paths (`../lib/parts-catalog`, `../data/catalog.json`).
Change them to your alias to match the repo, e.g.:

```ts
// page.tsx
import PartsAdvisor from "@/components/PartsAdvisor";
// PartsAdvisor.tsx
import { search, groundPns, VAT } from "@/lib/parts-catalog";
import catalogJson from "@/data/catalog.json";
import { EnquiryDrawer } from "@/components/EnquiryDrawer";
```

Notes:
- `data/catalog.json` is imported by the client component, so it's bundled into the client JS. It's
  small; if you'd rather lazy-load it, move it to `public/` and `fetch("/catalog.json")` in a
  `useEffect` (optional).
- `page.tsx` already `await`s `params`, so it works on **both Next 14 and Next 15**.
- The route sets `export const runtime = "edge"` (fast/cheap on Vercel). If your project pins the Node
  runtime or you hit an edge limitation, delete that one line.

## 2. Environment variable (the only secret)

Vercel → Project → **Settings → Environment Variables**:

| name | value |
|---|---|
| `GROQ_API_KEY` | a free key from **console.groq.com → API Keys** (no card needed) |
| `GROQ_MODEL` *(optional)* | defaults to `llama-3.3-70b-versatile`; see console.groq.com/docs/models |

For local dev, put `GROQ_API_KEY=...` in `.env.local`. The key is read **server-side only** in the
API route and is never sent to the browser. Free Groq tier limits are 30 req/min, 1000 req/day — the
advisor sends a tiny ~2 KB request per query (see *retrieve-then-rerank*), so that's plenty; if usage
grows, swap to a paid key (Groq or Anthropic — see *Customize*).

## 3. Design / tokens

The UI is styled entirely with your **existing shadcn-style Tailwind classes**, so it inherits the
shop theme with no extra CSS: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`,
`border-border`, `text-primary` / `bg-primary`, `font-heading`, `font-sans`. Fonts (Unbounded /
DM Sans) are already loaded by the shop.

If your token **names** differ from those, either map them in your Tailwind theme, or find/replace the
classes with these values:

| token | hex | token | hex |
|---|---|---|---|
| background | `#0b0d14` | primary (orange) | `#f26a22` |
| card / surface | `#101320` | accent (gold) | `#f6b02e` |
| foreground | `#f5f6f8` | secondary (cyan) | `#00b6d3` |
| muted-foreground | `#9ca9bd` | border | `#1f2533` |

(Two accents — `#00b6d3` badges and `#ffb066` model pills — are written as arbitrary values directly
in the JSX.)

## 4. Link it from the shop

Add a CTA wherever the Náhradné-diely category lives (locale-aware):

```tsx
import Link from "next/link";

<Link
  href={`/${lang}/products/poradca`}
  className="inline-flex h-12 items-center rounded-lg bg-primary px-6 font-heading font-semibold text-white"
>
  {lang === "en" ? "Parts Advisor" : "Poradca dielov"}
</Link>
```

## 5. Enquiry → where it goes

Open `components/EnquiryDrawer.tsx` and set Juraj's real details at the top:

```ts
const CONTACT = { email: "info@jxmotion.sk", whatsapp: "421900000000" }; // wa: digits only, no +
```

"Send" opens a prefilled **e-mail** and offers **WhatsApp** + **copy**. The full parts list (P/N ×
qty, descriptions, net + VAT totals) is pre-built as the `message` string.

**Prefer your own contact form / backend?** Replace the `mailto:` / `wa.me` actions with a POST:

```ts
await fetch("/api/contact", {                 // your existing endpoint
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message, items }),    // `message` is already formatted
});
```

## 6. Run & verify

```bash
npm run dev      # then open http://localhost:3000/sk/products/poradca
```

Test matrix:
- `carb` → carburetors with € prices
- `dážď` (or `wet`) → surfaces the **Rain Shield** (synonyms work, EN + SK)
- Model **Mini** + System **Engine** chips → only mini engine parts
- `FM19` → exact part jumps to the top
- **✨ Advisor** on a sentence (`zadná brzda pre seniora`) → grounded picks + a one-line note
- **+ Add** a few parts → **Dopyt (N)** button → drawer → **Send** (check the e-mail body)
- Confirm prices show the headline `s DPH` with `bez DPH` beneath, and the page matches the shop's look.

Unit tests for the logic (no key needed):

```bash
npx tsx parts-catalog.test.ts        # search + grounding (incl. a fake PN being dropped)
npx tsx parts-advisor.route.test.ts  # API route with a stubbed Groq response
```

---

## How it works

```
            ┌── deterministic search (client, instant, offline) ──┐
 user query │  lib/parts-catalog.search(parts, query, facets)     │→ result cards (real parts only)
            └─────────────────────────────────────────────────────┘
                                    │  (✨ Advisor button)
                                    ▼
   client narrows to ~30 real candidates  ──POST {query,candidates,lang}──▶  /api/parts-advisor
                                                                              │ adds GROQ_API_KEY
                                                                              ▼ Groq picks from candidates
   client validates every returned P/N with groundPns()  ◀──{pns,note}──────  route filters to candidate P/Ns
                                    │
                                    ▼  prices & descriptions read from catalog.json (never from the model)
                               grounded advisor cards
```

- **Deterministic search** is the always-on core — keyword + EN/SK synonym matching over the catalog,
  with model / subsystem / group facets. It can only return rows that exist.
- **The advisor** is *retrieve-then-rerank*: the catalog is too big for the free Groq tier in one
  shot, so the client first finds ~30 real candidates and the model only ever **picks from those**.
  Two independent gates (route allow-list + client `groundPns`) drop anything not in the catalog, and
  prices/descriptions are always rendered from `catalog.json`. A hallucination degrades to "fewer
  results", never a fake part or price.

## Data model (`data/catalog.json`)

```jsonc
{
  "meta": { "currency": "EUR", "pricing_basis": "...", "part_count": 563, "price_conflicts": 15 },
  "parts": [{
    "pn": "FM19-2A",                 // part number (dedup key)
    "desc": "CARBURETOR JUNIOR, FM19-2A",
    "price_eur": 122.44,             // NET retail, EUR, 2dp
    "models": ["mini", "junior"],    // mini | junior | senior
    "subsystems": ["engine"],        // chassis | engine
    "groups": ["8. CARB-AIR FILTER-PUMP"],
    "items": ["5"],
    "price_varies": true,            // optional: source sheets disagree
    "prices": [122.44, 124.0]        //   → UI shows a range + "confirm with Juraj"
  }]
}
```

Descriptions are English (that's how Juraj's source price list is written); the **UI** is bilingual.

## Pricing / VAT

`price_eur` is **net**. The UI shows `net × 1.23` as the headline (`s DPH`) with the net price beneath
(`bez DPH`). The rate is one constant — `VAT` in `lib/parts-catalog.ts` — change it if the rate
changes. 15 parts have conflicting prices in Juraj's source sheets and are flagged with a range +
"confirm with Juraj" (the `price_conflicts.txt` on the repo's `main` branch lists them for Juraj to fix).

## Updating the catalog

The catalog is generated from Juraj's 4 Excel files by `build_catalog.py` (repo `main` branch):

```bash
# on main, with the 4 updated .xlsx in source/
python3 build_catalog.py            # rewrites catalog.json (+ a self-check)
cp catalog.json shop-integration/data/catalog.json   # then copy into the shop / this package
```

## Customize

| Want to… | Where |
|---|---|
| Change the VAT rate | `VAT` in `lib/parts-catalog.ts` |
| Add search synonyms (EN/SK) | `SYNONYMS` in `lib/parts-catalog.ts` |
| Send more/fewer candidates to the AI | `MAX_CANDIDATES` in `route.ts` (keep ≤ ~40 for the free tier) |
| Swap the model | `GROQ_MODEL` env var |
| Move to a paid Anthropic key | in `route.ts`: change `GROQ_URL` + the request body to the Messages API, set the new env var. Nothing else changes. |

## Troubleshooting

| Symptom | Fix |
|---|---|
| ✨ Advisor button does nothing / 500 | `GROQ_API_KEY` not set in the env (route returns `{error:"GROQ_API_KEY not set"}`) |
| Page looks unstyled / wrong colours | your Tailwind tokens are named differently — map them, or use the hex table in §3 |
| Advisor returns nothing | the deterministic search found no candidates for that query — rephrase; search itself still works |
| `tsx` test: "top-level await … cjs" | run with `npx tsx <file>` (don't compile to CJS); already handled in the provided tests |
| Slovak characters not matching | search normalizes diacritics — confirm the input isn't HTML-escaped before reaching the component |

## Security

- The Groq key lives only in the server-side route (Vercel env) — never bundled to the client.
- No secrets in the repo. `catalog.json` (prices) is public by nature of a customer-facing shop.
- The advisor cannot be prompt-injected into inventing parts: the grounding gate discards any P/N not
  in the catalog regardless of what the model returns.

## Not in v1 (phase 2 ideas)

- Real cart/checkout (Comgate) — first map the 563 parts to Sanity products.
- Sanity product links / photos per part.
- Exploded-view diagrams (the source xlsx has them, but in non-web formats; deferred).
- A Sanity Studio block so Juraj can place the advisor on any page himself.

---

*Questions: the standalone reference build (same logic) is live at `samooo221.github.io/jurocennik`
and its source is on the repo's `main` branch.*
