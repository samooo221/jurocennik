// End-to-end check of the worker logic with a stubbed Groq response.
// `node worker/test_worker.mjs` — no real key or network needed.
import worker from "./worker.js";

// Stub Groq: it "returns" one valid candidate PN and one hallucinated PN.
globalThis.fetch = async () =>
  new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      pns: ["T-BRK-CAL", "HALLUCINATED-PN-999"],
      note: "Zadný brzdový strmeň.",
    }) } }],
  }), { status: 200 });

const req = new Request("http://x", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "zadná brzda",
    candidates: [{ pn: "T-BRK-CAL", desc: "REAR BRAKE CALIPER" }],
    lang: "sk",
  }),
});

const res = await worker.fetch(req, { GROQ_API_KEY: "test-key" });
const data = await res.json();
let fail = 0;
const check = (n, c) => { console.log(`  ${c ? "ok  -" : "FAIL-"} ${n}`); if (!c) fail++; };

check("worker drops the hallucinated PN, keeps the real candidate",
      JSON.stringify(data.pns) === JSON.stringify(["T-BRK-CAL"]));
check("note passed through", data.note === "Zadný brzdový strmeň.");
check("CORS header present", res.headers.get("Access-Control-Allow-Origin") === "*");

// OPTIONS preflight
const pre = await worker.fetch(new Request("http://x", { method: "OPTIONS" }), {});
check("OPTIONS preflight ok", pre.status === 200);
// missing key surfaces a clear error
const noKey = await worker.fetch(req, {});
check("missing GROQ_API_KEY -> 500", noKey.status === 500);

if (fail) { console.error(`\n${fail} FAILED`); process.exit(1); }
console.log("\nworker tests OK");
