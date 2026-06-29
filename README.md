# JX Motion — Parts Advisor

A phone-friendly web app for **Tillotson T4 go-kart spare parts**. A customer types
what they need (e.g. *"senior brake"*, *"dážď"*, *"FM19"*) and gets back **real parts
with real € prices** from Juraj's catalog. It can never invent a part or a price —
results only ever come from `catalog.json`.

- **Deterministic search** (always on, no key, works offline): keyword + EN/SK synonym
  matching with model / system / group filters.
- **Optional AI advisor** (free Groq via a Cloudflare Worker): interprets natural-language
  queries, picks from real candidates, and every part number it returns is validated
  against the catalog before display.

## Layout

```
build_catalog.py      one-time builder: source/*.xlsx -> catalog.json (stdlib only)
catalog.json          the catalog the app reads (committed; the source of truth)
price_conflicts.txt   parts whose price disagrees across Juraj's sheets — his fix-list
index.html            UI (dark JX Motion theme, EN/SK)
app.js                load / search / render / advisor call (+ grounding gate)
catalog-search.js     pure, tested search + grounding logic
test_search.mjs       node tests for search + grounding
worker/               Cloudflare Worker that proxies Groq (holds the key server-side)
logo.png  icon.png    branding
source/               the 4 .xlsx (git-ignored — keep locally to rebuild)
```

## Run locally

```bash
python3 -m http.server 8000      # then open http://127.0.0.1:8000
```

## Rebuild the catalog (when Juraj's prices change)

Put the 4 updated `.xlsx` in `source/`, then:

```bash
python3 build_catalog.py         # writes catalog.json + price_conflicts.txt, runs a self-check
git add catalog.json price_conflicts.txt && git commit -m "Update catalog" && git push
```

`price_conflicts.txt` lists any part that has two different prices in the source sheets
(shown in the app as a range + "confirm with Juraj"). Fixing those in the Excel and
rebuilding makes them clean single prices.

## Tests

```bash
node test_search.mjs             # search + the "never invents" grounding gate
node worker/test_worker.mjs      # worker logic (stubs Groq — no key needed)
```

## Deploy the site (GitHub Pages)

```bash
gh auth login                                  # once (run with: ! gh auth login)
gh repo create jurocennik --public --source=. --remote=origin --push
gh api -X POST repos/:owner/jurocennik/pages -f 'source[branch]=main' -f 'source[path]=/'
```

Site appears at `https://<your-user>.github.io/jurocennik/` (give it a minute on first build).
On the phone: open in Chrome → **Add to Home Screen**.

## Enable the AI advisor (free Groq + Cloudflare Worker)

1. Get a free Groq API key at **console.groq.com** → API Keys.
2. Deploy the worker:
   ```bash
   cd worker
   npx wrangler login                  # free Cloudflare account (run with: ! npx wrangler login)
   npx wrangler secret put GROQ_API_KEY # paste the Groq key
   npx wrangler deploy                  # prints https://jxmotion-parts-advisor.<you>.workers.dev
   ```
3. Put that URL in `app.js` → `const ADVISOR_URL = "https://…workers.dev";`, then commit + push.
   The ✨ Advisor button appears once it's set. (Search works without it.)

To swap to a paid Anthropic key later, change `GROQ_URL` + the request in `worker/worker.js`
and set the new secret — the rest of the app is unchanged.

## Notes

- **Contact** in the footer is a placeholder (`app.js` → `CONTACT`) — set Juraj's real phone/email.
- **Prices** are retail, EUR, ex works Tralee Ireland — the final Slovak price may differ
  (VAT, shipping, margin). The footer says so; confirm the numbers with Juraj.
- The repo is **public** (so GitHub Pages can serve it), which makes the catalog prices public —
  that's intended for a customer-facing tool. For a private catalog, use a private repo + private Pages.
