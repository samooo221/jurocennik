// Runnable check for the ported search + grounding core.  npx tsx parts-catalog.test.ts
import { readFileSync } from "node:fs";
import { search, expandQuery, groundPns, type Part } from "./lib/parts-catalog";

const cat = JSON.parse(readFileSync(new URL("./data/catalog.json", import.meta.url), "utf8"));
const parts: Part[] = cat.parts;
let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`  ${cond ? "ok  -" : "FAIL-"} ${name}`);
  if (!cond) failures++;
};

check("wet expands to rain", expandQuery("wet").includes("rain"));
check("brzda expands to brake", expandQuery("brzda").includes("brake"));
check("'carb' returns carburetors", search(parts, "carb", {}).some((p) => /carb/i.test(p.desc)));
check("'wet track' surfaces the rain shield",
      search(parts, "wet track", {}).some((p) => p.pn === "T-AIRFILTER-SHIELD-FM22"));
check("Slovak 'predná brzda' finds brake parts",
      search(parts, "predná brzda", {}).some((p) => p.groups.some((g) => /BRAKE/.test(g))));
const me = search(parts, "", { model: "mini", subsystem: "engine" });
check("facet mini+engine non-empty & correct",
      me.length > 0 && me.every((p) => p.models.includes("mini") && p.subsystems.includes("engine")));
check("empty query + no facet returns nothing", search(parts, "", {}).length === 0);
check("gibberish returns nothing", search(parts, "asdfqwer", {}).length === 0);
const exact = search(parts, "FM19-2A", {});
check("exact part number ranks first", exact.length > 0 && exact[0].pn === "FM19-2A");

const byPn = Object.fromEntries(parts.map((p) => [p.pn, p]));
const grounded = groundPns(["FM19-2A", "TOTALLY-FAKE-PN", "T-BRK-CAL", "FM19-2A"], byPn);
check("grounding keeps real PNs, drops fakes",
      grounded.length === 2 && grounded.every((p) => Boolean(byPn[p.pn])));
check("grounding returns full parts (with real prices)",
      grounded[0].price_eur > 0 && Boolean(grounded[0].desc));

if (failures) { console.error(`\n${failures} FAILED`); process.exit(1); }
console.log("\nparts-catalog tests OK");
