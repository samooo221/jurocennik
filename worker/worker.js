// Cloudflare Worker — Groq proxy for the JX Motion Parts Advisor.
// Holds the API key server-side (set as a secret, never committed) and adds CORS
// so the static GitHub Pages site can call it. Provider-swappable: to move to a
// paid Anthropic key later, change GROQ_URL + the request shape + the secret.
//
// Setup:
//   cd worker && npm i -g wrangler
//   wrangler secret put GROQ_API_KEY        # paste a free key from console.groq.com
//   wrangler deploy                          # -> https://<name>.<you>.workers.dev
//   wrangler dev                             # local: http://127.0.0.1:8787
// Then set ADVISOR_URL in ../app.js to that URL.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile"; // verify current ids at console.groq.com/docs/models
const MAX_CANDIDATES = 40;                        // keep the request well under Groq's free 6k TPM

const CORS = {
  "Access-Control-Allow-Origin": "*",             // tighten to your Pages origin if you like
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function buildMessages(query, candidates, lang) {
  const list = candidates.map((c) => `${c.pn}\t${c.desc}`).join("\n");
  const language = lang === "sk" ? "Slovak" : "English";
  const system =
    "You are a spare-parts advisor for Tillotson T4 go-karts. You are given a CANDIDATE LIST " +
    "of real catalog parts, one per line as `PARTNUMBER<TAB>description`. The customer asks in " +
    "natural language (possibly Slovak). Pick the parts from the candidate list that best fit the " +
    "request, most relevant first. STRICT RULES: use ONLY part numbers that appear verbatim in the " +
    "candidate list; never invent part numbers, parts, or prices; never output a price; if nothing " +
    "fits, return an empty list. Respond with ONLY a JSON object: " +
    `{"pns": ["PARTNUMBER", ...], "note": "<=1 short sentence in ${language} explaining the picks (or saying none matched)"}.`;
  const user = `CANDIDATE LIST:\n${list}\n\nCUSTOMER REQUEST: ${query}`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return json({ error: "POST only" }, 405);
    if (!env.GROQ_API_KEY) return json({ error: "GROQ_API_KEY not set" }, 500);

    let body;
    try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
    const query = (body.query || "").toString().slice(0, 500);
    const lang = body.lang === "sk" ? "sk" : "en";
    let candidates = Array.isArray(body.candidates) ? body.candidates : [];
    candidates = candidates.slice(0, MAX_CANDIDATES)
      .map((c) => ({ pn: String(c.pn || ""), desc: String(c.desc || "").slice(0, 120) }))
      .filter((c) => c.pn);
    if (!query || !candidates.length) return json({ pns: [], note: "" });

    let r;
    try {
      r = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: env.GROQ_MODEL || DEFAULT_MODEL,
          messages: buildMessages(query, candidates, lang),
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 400,
        }),
      });
    } catch (e) {
      return json({ error: "groq fetch failed", detail: String(e) }, 502);
    }
    if (!r.ok) return json({ error: "groq error", status: r.status, detail: await r.text() }, 502);

    const data = await r.json();
    let parsed = { pns: [], note: "" };
    try { parsed = JSON.parse(data.choices[0].message.content); } catch { /* keep default */ }
    // Belt-and-braces: only echo back candidate PNs (the client validates again too).
    const allowed = new Set(candidates.map((c) => c.pn));
    const pns = (Array.isArray(parsed.pns) ? parsed.pns : []).map(String).filter((pn) => allowed.has(pn));
    const note = typeof parsed.note === "string" ? parsed.note.slice(0, 300) : "";
    return json({ pns, note });
  },
};

// tiny self-check for the prompt builder (node worker/worker.js)
if (import.meta.url === `file://${process?.argv?.[1]}`) {
  const msgs = buildMessages("predná brzda", [{ pn: "T-BRK-CAL", desc: "REAR BRAKE CALIPER" }], "sk");
  console.assert(msgs.length === 2 && msgs[1].content.includes("T-BRK-CAL"), "builder includes candidate");
  console.assert(msgs[0].content.includes("Slovak"), "language threaded through");
  console.log("worker prompt-builder OK");
}
