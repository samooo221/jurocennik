// Pure catalog search — no DOM, works in the browser and in Node (for tests).
// The deterministic core: it can only ever return parts that exist in catalog.json,
// so it cannot invent a part or a price.

// Lowercase + strip diacritics so Slovak queries ("brzdový", "dážď") match the
// ASCII synonym keys and the English catalog text.
export function normalize(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// Query word (normalized, ASCII) -> extra canonical tokens to also search for.
// English + Slovak. Keys are already diacritic-stripped.
export const SYNONYMS = {
  wet: ["rain"], rain: ["rain"], mokry: ["rain"], mokra: ["rain"], dazd: ["rain"], dazdivy: ["rain"],
  brake: ["brake"], brzda: ["brake"], brzdy: ["brake"], brzdovy: ["brake"], brzdove: ["brake"],
  front: ["front"], predny: ["front"], predna: ["front"],
  rear: ["rear"], zadny: ["rear"], zadna: ["rear"],
  carb: ["carburetor"], carburettor: ["carburetor"], carburetor: ["carburetor"],
  karburator: ["carburetor"],
  wheel: ["rim", "wheel"], koleso: ["rim", "wheel"], rim: ["rim"], disk: ["rim"],
  tyre: ["tyre", "tire"], tire: ["tyre", "tire"], pneumatika: ["tyre", "tire"],
  engine: ["engine"], motor: ["engine"],
  chassis: ["chassis"], podvozok: ["chassis"], ram: ["chassis", "frame"], frame: ["frame"],
  seat: ["seat"], sedadlo: ["seat"], sedacka: ["seat"],
  chain: ["chain"], retaz: ["chain"],
  exhaust: ["exhaust"], vyfuk: ["exhaust"],
  clutch: ["clutch"], spojka: ["clutch"],
  axle: ["axle"], naprava: ["axle"], os: ["axle"],
  steering: ["steering"], riadenie: ["steering"],
  spoiler: ["spoiler"], bodywork: ["bodywork"], kapotaz: ["bodywork"],
  tank: ["tank", "fuel"], nadrz: ["tank", "fuel"], fuel: ["fuel"], palivo: ["fuel"],
  pedal: ["pedal"], filter: ["filter"], bearing: ["bearing"], lozisko: ["bearing"],
  hub: ["hub"], naboj: ["hub"], piston: ["piston"], piest: ["piston"],
};

// Everything a part can be matched on, normalized once and cached on the part.
function haystack(p) {
  if (p._h === undefined) {
    p._h = normalize(
      [p.pn, p.desc, (p.groups || []).join(" "), (p.models || []).join(" "),
       (p.subsystems || []).join(" ")].join(" ")
    );
  }
  return p._h;
}

// Split a query into normalized tokens and add each token's synonyms.
export function expandQuery(query) {
  const tokens = normalize(query).match(/[a-z0-9]+/g) || [];
  const out = new Set();
  for (const t of tokens) {
    out.add(t);
    for (const syn of SYNONYMS[t] || []) out.add(syn);
  }
  return [...out];
}

function facetMatch(p, { model, subsystem, group }) {
  if (model && !(p.models || []).includes(model)) return false;
  if (subsystem && !(p.subsystems || []).includes(subsystem)) return false;
  if (group && !(p.groups || []).includes(group)) return false;
  return true;
}

// Returns parts ranked by relevance. Empty query + no facets -> [] (the UI shows
// a "type to search" hint instead of dumping all 563 parts).
export function search(parts, query, facets = {}, limit = 200) {
  const hasFacets = facets.model || facets.subsystem || facets.group;
  const filtered = parts.filter((p) => facetMatch(p, facets));
  const q = normalize(query).trim();

  if (!q) {
    if (!hasFacets) return [];
    return filtered.slice().sort((a, b) => a.pn.localeCompare(b.pn)).slice(0, limit);
  }

  const tokens = expandQuery(query);
  const qCompact = q.replace(/[^a-z0-9]/g, "");
  const scored = [];
  for (const p of filtered) {
    const h = haystack(p);
    const pnNorm = normalize(p.pn);
    let score = 0;
    if (pnNorm === q) score += 1000;                       // exact part number
    if (qCompact && pnNorm.replace(/[^a-z0-9]/g, "").includes(qCompact)) score += 50;
    for (const t of tokens) if (h.includes(t)) score += 1;  // token present anywhere
    if (score > 0) scored.push([score, p]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].pn.localeCompare(b[1].pn));
  return scored.slice(0, limit).map(([, p]) => p);
}

// The "never invents" gate: map advisor-returned part numbers to real catalog
// parts, dropping any that don't exist. byPn is { pn: part }. This is what makes
// a hallucinated part number degrade to "fewer results" instead of a fake part.
export function groundPns(pns, byPn) {
  const seen = new Set();
  return (Array.isArray(pns) ? pns : [])
    .map((pn) => byPn[pn])
    .filter((p) => p && !seen.has(p.pn) && seen.add(p.pn));
}
