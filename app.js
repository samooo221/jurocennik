// DOM glue for the JX Motion Parts Advisor.
// Deterministic search (catalog-search.js) is the always-on core; the optional
// Groq advisor adds NL understanding and is grounded by validating every part
// number it returns against the catalog.
import { search, groundPns } from "./catalog-search.js";

// === CONFIG ===========================================================
// URL of the Cloudflare Worker that proxies Groq (holds the key server-side).
// Empty string = advisor hidden (deterministic search still works fully).
// Local dev: "http://127.0.0.1:8787"  ·  Deployed: "https://<worker>.workers.dev"
const ADVISOR_URL = "https://jxmotion-parts-advisor.pavlovicsamuel1.workers.dev";
// Placeholder until Juraj's real details are in — shown in the footer + empty state.
const CONTACT = { name: "JX Motion — Juraj", phone: "+421 ___ ___ ___", email: "info@jxmotion.sk" };
// ======================================================================

const I18N = {
  en: {
    subtitle: "Parts Advisor", search_ph: "Search parts… e.g. “senior brake”, “rain”, “FM19”",
    advisor: "Advisor", model: "Model", system: "System", group: "Group & sort",
    all: "All groups", sort_rel: "Best match", sort_lo: "Price ↑", sort_hi: "Price ↓",
    chassis: "Chassis", engine: "Engine", mini: "Mini", junior: "Junior", senior: "Senior",
    empty: "No matching part.", hint: "Type to search, pick a filter, or ask the advisor.",
    results: (n) => `${n} part${n === 1 ? "" : "s"}`,
    varies: "price varies — confirm with Juraj", copy: "copy", copied: "✓",
    ai_head: "Advisor picks", ai_none: "The advisor found no confident match — try the search above.",
    ai_err: "Advisor unavailable right now — use the search above.", ai_wait: "Thinking…",
    disclaimer: "Prices: retail, EUR, ex works Tralee Ireland — final Slovak price may differ (VAT, shipping). Confirm with Juraj.",
    contact_lbl: "Contact",
  },
  sk: {
    subtitle: "Poradca dielov", search_ph: "Hľadať diely… napr. „senior brzda“, „dážď“, „FM19“",
    advisor: "Poradca", model: "Model", system: "Systém", group: "Skupina a zoradenie",
    all: "Všetky skupiny", sort_rel: "Najlepšia zhoda", sort_lo: "Cena ↑", sort_hi: "Cena ↓",
    chassis: "Podvozok", engine: "Motor", mini: "Mini", junior: "Junior", senior: "Senior",
    empty: "Žiadny zodpovedajúci diel.", hint: "Píšte, zvoľte filter alebo sa spýtajte poradcu.",
    results: (n) => `${n} ${n === 1 ? "diel" : n < 5 ? "diely" : "dielov"}`,
    varies: "cena sa líši — overte u Juraja", copy: "kopírovať", copied: "✓",
    ai_head: "Návrhy poradcu", ai_none: "Poradca nenašiel jednoznačnú zhodu — skúste vyhľadávanie vyššie.",
    ai_err: "Poradca momentálne nedostupný — použite vyhľadávanie vyššie.", ai_wait: "Premýšľam…",
    disclaimer: "Ceny: maloobchodné, EUR, zo závodu Tralee (Írsko) — konečná cena na Slovensku sa môže líšiť (DPH, doprava). Overte u Juraja.",
    contact_lbl: "Kontakt",
  },
};

const MODELS = ["mini", "junior", "senior"];
const SUBSYSTEMS = ["chassis", "engine"];
const state = {
  lang: localStorage.getItem("lang") === "sk" ? "sk" : "en",
  query: "", sort: "rel",
  facets: { model: "", subsystem: "", group: "" },
};
let CATALOG = [];
let BY_PN = {};
const t = () => I18N[state.lang];
const euro = (n) => "€" + n.toFixed(2);
const $ = (id) => document.getElementById(id);
const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function init() {
  const data = await (await fetch("catalog.json")).json();
  CATALOG = data.parts;
  BY_PN = Object.fromEntries(CATALOG.map((p) => [p.pn, p]));
  buildGroupOptions();
  buildChips();
  wireEvents();
  if (ADVISOR_URL) $("advisor-btn").style.display = "flex";
  applyLang();
  render();
}

function buildGroupOptions() {
  const groups = [...new Set(CATALOG.flatMap((p) => p.groups))].sort(
    (a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));
  $("group").innerHTML = `<option value="">${t().all}</option>` +
    groups.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join("");
  $("group").value = state.facets.group;
  $("sort").innerHTML =
    `<option value="rel">${t().sort_rel}</option>` +
    `<option value="lo">${t().sort_lo}</option>` +
    `<option value="hi">${t().sort_hi}</option>`;
  $("sort").value = state.sort;
}

function buildChips() {
  const mk = (facet, value) => {
    const b = document.createElement("button");
    b.className = "chip"; b.textContent = t()[value];
    b.dataset.facet = facet; b.dataset.value = value;
    b.onclick = () => {
      state.facets[facet] = state.facets[facet] === value ? "" : value;
      syncChips(); render();
    };
    return b;
  };
  const m = $("facet-model"); m.innerHTML = ""; MODELS.forEach((v) => m.appendChild(mk("model", v)));
  const s = $("facet-subsystem"); s.innerHTML = ""; SUBSYSTEMS.forEach((v) => s.appendChild(mk("subsystem", v)));
  syncChips();
}

function syncChips() {
  document.querySelectorAll(".chip").forEach((b) =>
    b.classList.toggle("active", state.facets[b.dataset.facet] === b.dataset.value));
}

function wireEvents() {
  $("q").addEventListener("input", (e) => { state.query = e.target.value; render(); });
  $("group").addEventListener("change", (e) => { state.facets.group = e.target.value; render(); });
  $("sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  $("advisor-btn").addEventListener("click", askAdvisor);
  $("lang-toggle").addEventListener("click", () => {
    state.lang = state.lang === "en" ? "sk" : "en";
    localStorage.setItem("lang", state.lang);
    buildGroupOptions(); buildChips(); applyLang(); render();
    $("advisor").style.display = "none";  // stale-language note; re-ask if wanted
  });
  // delegated copy-to-clipboard for part numbers
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".copy");
    if (!btn) return;
    navigator.clipboard?.writeText(btn.dataset.pn);
    const prev = btn.textContent;
    btn.textContent = t().copied; btn.classList.add("done");
    setTimeout(() => { btn.textContent = prev; btn.classList.remove("done"); }, 1200);
  });
}

function applyLang() {
  document.documentElement.lang = state.lang;
  $("subtitle").textContent = t().subtitle;
  $("q").placeholder = t().search_ph;
  $("advisor-label").textContent = t().advisor;
  $("lbl-model").textContent = t().model;
  $("lbl-system").textContent = t().system;
  $("lbl-group").textContent = t().group;
  $("disclaimer").textContent = t().disclaimer;
  $("contact").innerHTML = `<b>${t().contact_lbl}:</b> ${esc(CONTACT.name)} · ${esc(CONTACT.phone)} · ` +
    `<a href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a>`;
  $("lang-toggle").textContent = state.lang === "en" ? "SK" : "EN";
}

function applySort(list) {
  if (state.sort === "lo") return list.slice().sort((a, b) => a.price_eur - b.price_eur);
  if (state.sort === "hi") return list.slice().sort((a, b) => b.price_eur - a.price_eur);
  return list; // relevance — keep search order
}

function priceHTML(p) {
  if (p.price_varies) {
    const lo = Math.min(...p.prices), hi = Math.max(...p.prices);
    return `<div><div class="price"><span class="vary">${euro(lo)}–${euro(hi)}</span></div>
            <div class="warn">⚠︎ ${t().varies}</div></div>`;
  }
  return `<div class="price">${euro(p.price_eur)}</div>`;
}

function card(p) {
  const models = p.models.map((m) => `<span class="badge model">${t()[m]}</span>`).join("");
  const sys = p.subsystems.map((s) => `<span class="badge sys">${t()[s]}</span>`).join("");
  const groups = p.groups.map((g) => `<span class="badge">${esc(g)}</span>`).join("");
  const items = p.items.filter((i) => i && i !== "N/A").join(", ");
  return `<div class="card">
    <div class="card-head">
      <span class="pn-wrap"><span class="pn">${esc(p.pn)}</span>
        <button class="copy" data-pn="${esc(p.pn)}">${t().copy}</button></span>
      ${priceHTML(p)}
    </div>
    <div class="desc">${esc(p.desc)}</div>
    <div class="badges">${models}${sys}${groups}</div>
    ${items ? `<details><summary>${t().group}</summary><div class="meta"><b>Item:</b> ${esc(items)}</div></details>` : ""}
  </div>`;
}

function render() {
  const results = applySort(search(CATALOG, state.query, state.facets));
  const status = $("status"), out = $("results");
  const noQuery = !state.query.trim() && !state.facets.model && !state.facets.subsystem && !state.facets.group;
  if (noQuery) { status.textContent = t().hint; out.innerHTML = ""; return; }
  if (!results.length) { status.textContent = t().empty; out.innerHTML = ""; return; }
  status.textContent = t().results(results.length);
  out.innerHTML = results.map(card).join("");
}

// === Groq advisor (grounded) =========================================
async function askAdvisor() {
  const query = state.query.trim();
  if (!ADVISOR_URL || !query) return;
  const panel = $("advisor");
  panel.style.display = "block";
  panel.innerHTML = `<div class="ahead"><b>✨ ${t().ai_head}</b> · ${t().ai_wait}</div>`;
  $("advisor-btn").disabled = true;

  // Retrieve-then-rerank: narrow to candidates with the deterministic search
  // (respecting active facets), send only those — keeps the request tiny.
  const candidates = search(CATALOG, query, state.facets, 40).map((p) => ({ pn: p.pn, desc: p.desc }));
  try {
    if (!candidates.length) { renderAdvisor([], t().ai_none, 0); return; }
    const res = await fetch(ADVISOR_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, candidates, lang: state.lang }),
    });
    if (!res.ok) throw new Error("worker " + res.status);
    const data = await res.json();
    // GROUNDING GATE: keep only part numbers that actually exist in the catalog.
    // Prices/descriptions are taken from the catalog, never from the model.
    const returned = Array.isArray(data.pns) ? data.pns : [];
    const valid = groundPns(returned, BY_PN);
    renderAdvisor(valid, data.note || "", returned.length - valid.length);
  } catch (e) {
    renderAdvisor(null, t().ai_err, 0);
  } finally {
    $("advisor-btn").disabled = false;
  }
}

function renderAdvisor(parts, note, dropped) {
  const panel = $("advisor");
  let html = `<div class="ahead"><b>✨ ${t().ai_head}</b></div>`;
  if (note) html += `<div class="anote">${esc(note)}</div>`;
  if (parts === null) { panel.innerHTML = html; return; }            // error
  if (!parts.length) {
    html += `<div class="anote">${t().ai_none}</div>`;
    panel.innerHTML = html; return;
  }
  html += `<div class="acards">${parts.map(card).join("")}</div>`;
  panel.innerHTML = html;
}

init();
