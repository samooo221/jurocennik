// Runnable check for the deterministic search core. `node test_search.mjs`.
import { readFileSync } from "node:fs";
import { search, expandQuery, groundPns } from "./catalog-search.js";

const cat = JSON.parse(readFileSync(new URL("./catalog.json", import.meta.url)));
const parts = cat.parts;
let failures = 0;
function check(name, cond) {
  if (cond) { console.log("  ok  -", name); }
  else { console.error("  FAIL-", name); failures++; }
}

// synonym expansion
check("wet expands to rain", expandQuery("wet").includes("rain"));
check("brzda expands to brake", expandQuery("brzda").includes("brake"));

// query behaviour
const carb = search(parts, "carb", {});
check("'carb' returns carburetors", carb.some((p) => /carb/i.test(p.desc)));

const wet = search(parts, "wet track", {});
check("'wet track' surfaces the rain shield",
      wet.some((p) => p.pn === "T-AIRFILTER-SHIELD-FM22"));

const brzda = search(parts, "predná brzda", {});
check("Slovak 'predná brzda' finds brake parts",
      brzda.some((p) => p.groups.some((g) => /BRAKE/.test(g))));

const miniEngine = search(parts, "", { model: "mini", subsystem: "engine" });
check("facet mini+engine non-empty & correct",
      miniEngine.length > 0 &&
      miniEngine.every((p) => p.models.includes("mini") && p.subsystems.includes("engine")));

check("empty query + no facet returns nothing", search(parts, "", {}).length === 0);
check("gibberish returns nothing", search(parts, "asdfqwer", {}).length === 0);

const exact = search(parts, "FM19-2A", {});
check("exact part number ranks first", exact.length > 0 && exact[0].pn === "FM19-2A");

// grounding gate: a hallucinated PN from the advisor must be dropped
const byPn = Object.fromEntries(parts.map((p) => [p.pn, p]));
const grounded = groundPns(["FM19-2A", "TOTALLY-FAKE-PN", "T-BRK-CAL", "FM19-2A"], byPn);
check("grounding keeps real PNs, drops fakes",
      grounded.length === 2 && grounded.every((p) => p && byPn[p.pn]));
check("grounding returns full parts (with real prices)",
      grounded[0].price_eur > 0 && grounded[0].desc);

if (failures) { console.error(`\n${failures} FAILED`); process.exit(1); }
console.log("\nsearch tests OK");
