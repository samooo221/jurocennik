// Native parts-advisor page → /sk/products/poradca (and /en/...).
// Server component; renders the client advisor. Adjust the import to the shop's
// path alias (e.g. "@/components/PartsAdvisor") when you drop it in — see INTEGRATION.md.
import PartsAdvisor from "../../../../components/PartsAdvisor";

export const metadata = {
  title: "Poradca dielov — JX Motion",
  description: "Nájdite správny náhradný diel Tillotson T4.",
};

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  // `await` works whether params is a Promise (Next 15) or a plain object (Next 14).
  const { lang } = await params;
  const l: "sk" | "en" = lang === "en" ? "en" : "sk";
  const title = l === "en" ? "Parts Advisor" : "Poradca dielov";
  const sub = l === "en"
    ? "Find the right Tillotson T4 spare part and send Juraj an enquiry."
    : "Nájdite správny náhradný diel Tillotson T4 a pošlite Jurajovi dopyt.";

  return (
    <main className="bg-background min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <h1 className="font-heading font-bold uppercase tracking-tight text-3xl sm:text-4xl text-foreground">
          {title}
        </h1>
        <p className="mt-2 text-muted-foreground">{sub}</p>
        <div className="mt-6">
          <PartsAdvisor lang={l} />
        </div>
      </div>
    </main>
  );
}
