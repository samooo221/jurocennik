// End-to-end check of the API route with a stubbed Groq response.
//   npx tsx parts-advisor.route.test.ts
import { POST, buildMessages } from "./app/api/parts-advisor/route";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`  ${cond ? "ok  -" : "FAIL-"} ${name}`);
  if (!cond) failures++;
};

const mkReq = (b: unknown) =>
  new Request("http://x/api/parts-advisor", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
  });

async function main() {
  // builder threads candidates + language through
  const msgs = buildMessages("predná brzda", [{ pn: "T-BRK-CAL", desc: "REAR BRAKE CALIPER" }], "sk");
  check("prompt includes candidate", msgs.length === 2 && msgs[1].content.includes("T-BRK-CAL"));
  check("prompt threads language", msgs[0].content.includes("Slovak"));

  // stub Groq: returns one valid candidate PN + one hallucinated PN
  (globalThis as any).fetch = async () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        pns: ["T-BRK-CAL", "HALLUCINATED-PN-999"],
        note: "Zadný brzdový strmeň.",
      }) } }],
    }), { status: 200 });

  (globalThis as any).process = (globalThis as any).process ?? { env: {} };
  (globalThis as any).process.env.GROQ_API_KEY = "test-key";

  const res = await POST(mkReq({
    query: "zadná brzda",
    candidates: [{ pn: "T-BRK-CAL", desc: "REAR BRAKE CALIPER" }],
    lang: "sk",
  }));
  const data = await res.json();
  check("route drops hallucinated PN, keeps real candidate",
        JSON.stringify(data.pns) === JSON.stringify(["T-BRK-CAL"]));
  check("note passed through", data.note === "Zadný brzdový strmeň.");

  // missing key -> 500
  delete (globalThis as any).process.env.GROQ_API_KEY;
  const noKey = await POST(mkReq({ query: "x", candidates: [{ pn: "A", desc: "b" }], lang: "en" }));
  check("missing GROQ_API_KEY -> 500", noKey.status === 500);

  if (failures) { console.error(`\n${failures} FAILED`); process.exit(1); }
  console.log("\nparts-advisor route tests OK");
}
main();
