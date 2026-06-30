"use client";
// Native parts-advisor for the JX Motion shop. Deterministic search is the
// always-on core; the Groq advisor (via /api/parts-advisor) adds NL understanding
// and is grounded — every part it returns is validated against the catalog.
// Styled with the shop's design tokens (bg-card, text-foreground, text-primary,
// font-heading/sans) so it inherits the theme. See INTEGRATION.md for token/paths.
import { useMemo, useState } from "react";
import { search, groundPns, VAT, type Part, type Catalog, type Facets } from "../lib/parts-catalog";
import catalogJson from "../data/catalog.json";
import { EnquiryDrawer, type EnquiryItem } from "./EnquiryDrawer";

const CATALOG = catalogJson as Catalog;
const PARTS = CATALOG.parts;
const BY_PN: Record<string, Part> = Object.fromEntries(PARTS.map((p) => [p.pn, p]));
const GROUPS = [...new Set(PARTS.flatMap((p) => p.groups))].sort(
  (a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b)
);

type Lang = "sk" | "en";
const MODELS = ["mini", "junior", "senior"] as const;
const SUBSYSTEMS = ["chassis", "engine"] as const;

const T = {
  en: {
    ph: "Search parts… e.g. “senior brake”, “rain”, “FM19”", advisor: "Advisor",
    model: "Model", system: "System", group: "Group", sort: "Sort",
    all: "All groups", sort_rel: "Best match", sort_lo: "Price ↑", sort_hi: "Price ↓",
    chassis: "Chassis", engine: "Engine", mini: "Mini", junior: "Junior", senior: "Senior",
    empty: "No matching part — add it to an enquiry and ask Juraj.",
    hint: "Type to search, pick a filter, or ask the advisor.",
    results: (n: number) => `${n} part${n === 1 ? "" : "s"}`,
    incl: "incl. VAT", excl: "excl. VAT", varies: "price varies — confirm with Juraj",
    copy: "copy", copied: "✓", add: "Add", added: "✓ Added",
    ai_head: "Advisor picks", ai_none: "No confident match — try the search above.",
    ai_err: "Advisor unavailable — use the search above.", ai_wait: "Thinking…",
  },
  sk: {
    ph: "Hľadať diely… napr. „senior brzda“, „dážď“, „FM19“", advisor: "Poradca",
    model: "Model", system: "Systém", group: "Skupina", sort: "Zoradiť",
    all: "Všetky skupiny", sort_rel: "Najlepšia zhoda", sort_lo: "Cena ↑", sort_hi: "Cena ↓",
    chassis: "Podvozok", engine: "Motor", mini: "Mini", junior: "Junior", senior: "Senior",
    empty: "Žiadny diel — pridajte do dopytu a opýtajte sa Juraja.",
    hint: "Píšte, zvoľte filter alebo sa spýtajte poradcu.",
    results: (n: number) => `${n} ${n === 1 ? "diel" : n < 5 ? "diely" : "dielov"}`,
    incl: "s DPH", excl: "bez DPH", varies: "cena sa líši — overte u Juraja",
    copy: "kopírovať", copied: "✓", add: "Pridať", added: "✓ Pridané",
    ai_head: "Návrhy poradcu", ai_none: "Žiadna jednoznačná zhoda — skúste vyhľadávanie vyššie.",
    ai_err: "Poradca nedostupný — použite vyhľadávanie.", ai_wait: "Premýšľam…",
  },
} as const;

const euro = (n: number) => "€" + n.toFixed(2);
const withVat = (n: number) => euro(n * VAT);

export default function PartsAdvisor({ lang = "sk" }: { lang?: Lang }) {
  const t = T[lang];
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<Facets>({});
  const [sort, setSort] = useState<"rel" | "lo" | "hi">("rel");
  const [copied, setCopied] = useState<string | null>(null);
  const [enquiry, setEnquiry] = useState<Record<string, number>>({}); // pn -> qty
  const [ai, setAi] = useState<{ parts: Part[]; note: string; loading: boolean; error: boolean } | null>(null);

  const results = useMemo(() => {
    const r = search(PARTS, query, facets);
    if (sort === "lo") return r.slice().sort((a, b) => a.price_eur - b.price_eur);
    if (sort === "hi") return r.slice().sort((a, b) => b.price_eur - a.price_eur);
    return r;
  }, [query, facets, sort]);

  const noQuery = !query.trim() && !facets.model && !facets.subsystem && !facets.group;
  const toggleFacet = (k: keyof Facets, v: string) =>
    setFacets((f) => ({ ...f, [k]: f[k] === v ? "" : v }));

  const copyPn = (pn: string) => {
    navigator.clipboard?.writeText(pn);
    setCopied(pn);
    setTimeout(() => setCopied((c) => (c === pn ? null : c)), 1200);
  };
  const addToEnquiry = (pn: string) => setEnquiry((e) => ({ ...e, [pn]: (e[pn] ?? 0) + 1 }));

  async function askAdvisor() {
    const q = query.trim();
    if (!q) return;
    setAi({ parts: [], note: "", loading: true, error: false });
    const candidates = search(PARTS, q, facets, 40).map((p) => ({ pn: p.pn, desc: p.desc }));
    if (!candidates.length) { setAi({ parts: [], note: t.ai_none, loading: false, error: false }); return; }
    try {
      const res = await fetch("/api/parts-advisor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, candidates, lang }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      // GROUNDING GATE: keep only PNs that exist; render price/desc from the catalog.
      setAi({ parts: groundPns(data.pns, BY_PN), note: data.note || "", loading: false, error: false });
    } catch {
      setAi({ parts: [], note: t.ai_err, loading: false, error: true });
    }
  }

  const enquiryItems: EnquiryItem[] = Object.entries(enquiry)
    .filter(([, q]) => q > 0)
    .map(([pn, qty]) => ({ part: BY_PN[pn], qty }))
    .filter((i) => i.part);

  const chip = (k: keyof Facets, v: string, label: string) => (
    <button key={v} onClick={() => toggleFacet(k, v)}
      className={`rounded-full px-4 py-2 text-sm border transition ${
        facets[k] === v ? "bg-primary text-white border-transparent font-medium"
                        : "bg-card text-foreground border-border hover:border-primary/50"}`}>
      {label}
    </button>
  );

  const Card = ({ p }: { p: Part }) => {
    const lo = p.price_varies ? Math.min(...(p.prices ?? [p.price_eur])) : p.price_eur;
    const hi = p.price_varies ? Math.max(...(p.prices ?? [p.price_eur])) : p.price_eur;
    const inList = (enquiry[p.pn] ?? 0) > 0;
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-base break-all">{p.pn}</span>
              <button onClick={() => copyPn(p.pn)}
                className={`text-[11px] px-2 py-0.5 rounded border border-border ${
                  copied === p.pn ? "text-emerald-400 border-emerald-400" : "text-muted-foreground"}`}>
                {copied === p.pn ? t.copied : t.copy}
              </button>
            </div>
            <p className="mt-1.5 text-sm">{p.desc}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.models.map((m) => (
                <span key={m} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-[#ffb066]">
                  {T[lang][m as keyof typeof t] as string}
                </span>
              ))}
              {p.subsystems.map((s) => (
                <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-[#00b6d3]/15 text-[#7fdcea]">
                  {T[lang][s as keyof typeof t] as string}
                </span>
              ))}
              {p.groups.map((g) => (
                <span key={g} className="text-[11px] px-2 py-0.5 rounded-full bg-border text-muted-foreground">{g}</span>
              ))}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-bold text-lg whitespace-nowrap">
              {p.price_varies ? <span className="text-primary">{withVat(lo)}–{withVat(hi)}</span> : withVat(p.price_eur)}
              <span className="ml-1 text-[10px] font-semibold text-muted-foreground">{t.incl}</span>
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {p.price_varies ? `${euro(lo)}–${euro(hi)}` : euro(p.price_eur)} {t.excl}
            </div>
            {p.price_varies && <div className="text-xs text-primary mt-0.5">⚠︎ {t.varies}</div>}
            <button onClick={() => addToEnquiry(p.pn)}
              className={`mt-2 text-sm font-medium font-heading rounded-lg px-4 py-1.5 ${
                inList ? "bg-card border border-primary text-primary" : "bg-primary text-white"}`}>
              {inList ? `${t.added} (${enquiry[p.pn]})` : `+ ${t.add}`}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="font-sans text-foreground">
      {/* search + advisor */}
      <div className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} type="search"
          placeholder={t.ph} autoCapitalize="off" spellCheck={false}
          className="flex-1 rounded-lg bg-card border border-border px-4 py-3 text-base
                     focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" />
        <button onClick={askAdvisor} disabled={!query.trim() || ai?.loading}
          className="rounded-lg px-4 font-heading font-semibold text-white bg-gradient-to-br
                     from-[#f26a22] to-[#f6b02e] disabled:opacity-50 whitespace-nowrap">
          ✨ {t.advisor}
        </button>
      </div>

      {/* facets + sort */}
      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="w-full text-xs uppercase tracking-wider text-muted-foreground">{t.model}</span>
          {MODELS.map((m) => chip("model", m, t[m]))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="w-full text-xs uppercase tracking-wider text-muted-foreground">{t.system}</span>
          {SUBSYSTEMS.map((s) => chip("subsystem", s, t[s]))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="w-full text-xs uppercase tracking-wider text-muted-foreground">{t.group} · {t.sort}</span>
          <select value={facets.group ?? ""} onChange={(e) => setFacets((f) => ({ ...f, group: e.target.value }))}
            className="flex-1 min-w-40 rounded-lg bg-card border border-border px-3 py-2 text-sm">
            <option value="">{t.all}</option>
            {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)}
            className="rounded-lg bg-card border border-border px-3 py-2 text-sm">
            <option value="rel">{t.sort_rel}</option>
            <option value="lo">{t.sort_lo}</option>
            <option value="hi">{t.sort_hi}</option>
          </select>
        </div>
      </div>

      {/* advisor panel */}
      {ai && (
        <div className="mt-5 rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 text-sm font-heading"
               style={{ background: "linear-gradient(135deg,rgba(242,106,34,.16),rgba(246,176,46,.16))" }}>
            ✨ <b className="text-primary">{t.ai_head}</b>{ai.loading && ` · ${t.ai_wait}`}
          </div>
          {ai.note && <div className="px-4 py-2.5 text-sm border-b border-border">{ai.note}</div>}
          {!ai.loading && ai.parts.length > 0 && (
            <div className="p-2.5 space-y-2.5">{ai.parts.map((p) => <Card key={"ai-" + p.pn} p={p} />)}</div>
          )}
        </div>
      )}

      {/* results */}
      <p className="mt-5 mb-2 text-sm text-muted-foreground">
        {noQuery ? t.hint : results.length ? t.results(results.length) : t.empty}
      </p>
      {!noQuery && <div className="space-y-2.5">{results.map((p) => <Card key={p.pn} p={p} />)}</div>}

      {/* enquiry */}
      <EnquiryDrawer items={enquiryItems} lang={lang} setQty={(pn, q) => setEnquiry((e) => ({ ...e, [pn]: q }))} />
    </div>
  );
}
