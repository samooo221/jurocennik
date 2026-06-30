// Next.js App Router API route — grounded Groq proxy for the parts advisor.
// Same-origin (no CORS needed). The key lives in process.env.GROQ_API_KEY
// (set it in Vercel project env vars). Ported from the standalone Cloudflare
// Worker. Returns standard Web Responses so it runs in any App Router app and
// is unit-testable without next installed.
//
// To swap to a paid Anthropic key later: change GROQ_URL + the request body and
// set the new env var — nothing else changes.

export const runtime = "edge"; // fast + cheap; remove this line to use the Node runtime

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile"; // verify current ids at console.groq.com/docs/models
const MAX_CANDIDATES = 40; // keep the request well under Groq's free 6k TPM

interface Candidate { pn: string; desc: string; }

function buildMessages(query: string, candidates: Candidate[], lang: string) {
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
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export async function POST(req: Request): Promise<Response> {
  const key = (globalThis as any).process?.env?.GROQ_API_KEY as string | undefined;
  if (!key) return json({ error: "GROQ_API_KEY not set" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  const query = String(body?.query ?? "").slice(0, 500);
  const lang = body?.lang === "sk" ? "sk" : "en";
  const candidates: Candidate[] = (Array.isArray(body?.candidates) ? body.candidates : [])
    .slice(0, MAX_CANDIDATES)
    .map((c: any) => ({ pn: String(c?.pn ?? ""), desc: String(c?.desc ?? "").slice(0, 120) }))
    .filter((c: Candidate) => c.pn);

  if (!query || candidates.length === 0) return json({ pns: [], note: "" });

  let r: Response;
  try {
    r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: (globalThis as any).process?.env?.GROQ_MODEL || DEFAULT_MODEL,
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

  const data: any = await r.json();
  let parsed: { pns?: unknown; note?: unknown } = { pns: [], note: "" };
  try { parsed = JSON.parse(data.choices[0].message.content); } catch { /* keep default */ }

  // Belt-and-braces: only echo back candidate PNs (the client validates again too).
  const allowed = new Set(candidates.map((c) => c.pn));
  const pns = (Array.isArray(parsed.pns) ? parsed.pns : []).map(String).filter((pn) => allowed.has(pn));
  const note = typeof parsed.note === "string" ? parsed.note.slice(0, 300) : "";
  return json({ pns, note });
}

// Exported for unit tests (see parts-advisor.test.ts).
export { buildMessages };
