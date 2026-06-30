"use client";
// Enquiry list → send to Juraj (browse + inquire, no checkout in v1).
// Floating "Dopyt (N)" button opens a panel; "send" builds a formatted parts
// list and hands it off via email / WhatsApp / clipboard. Point CONTACT at
// Juraj's real channels (or wire SUBMIT to the shop's contact endpoint —
// see INTEGRATION.md).
import { useState } from "react";
import { VAT, type Part } from "../lib/parts-catalog";

export interface EnquiryItem { part: Part; qty: number; }

// TODO: replace with Juraj's real details before launch.
const CONTACT = { email: "info@jxmotion.sk", whatsapp: "421900000000" }; // wa: digits only, no +

const T = {
  en: { btn: "Enquiry", title: "Your enquiry", empty: "No parts yet — add some from the results.",
    net: "Net", vat: "incl. VAT", total: "Total", remove: "remove",
    email: "Send by e-mail", wa: "Send on WhatsApp", copy: "Copy list", copied: "✓ Copied",
    subject: "Parts enquiry — JX Motion", intro: "Hello Juraj, I'd like to enquire about these parts:",
    close: "Close" },
  sk: { btn: "Dopyt", title: "Váš dopyt", empty: "Zatiaľ žiadne diely — pridajte ich z výsledkov.",
    net: "Bez DPH", vat: "s DPH", total: "Spolu", remove: "odstrániť",
    email: "Poslať e-mailom", wa: "Poslať cez WhatsApp", copy: "Kopírovať zoznam", copied: "✓ Skopírované",
    subject: "Dopyt na diely — JX Motion", intro: "Dobrý deň Juraj, mám záujem o tieto diely:",
    close: "Zavrieť" },
} as const;

const euro = (n: number) => "€" + n.toFixed(2);

export function EnquiryDrawer({ items, lang, setQty }:
  { items: EnquiryItem[]; lang: "sk" | "en"; setQty: (pn: string, qty: number) => void }) {
  const t = T[lang];
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const count = items.reduce((s, i) => s + i.qty, 0);
  const net = items.reduce((s, i) => s + i.part.price_eur * i.qty, 0);
  const gross = net * VAT;

  const message =
    `${t.intro}\n\n` +
    items.map((i) => `${i.qty}× ${i.part.pn} — ${i.part.desc} — ${euro(i.part.price_eur * i.qty)} ${t.net}`).join("\n") +
    `\n\n${t.total}: ${euro(gross)} ${t.vat} (${euro(net)} ${t.net})`;

  const mailto = `mailto:${CONTACT.email}?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(message)}`;
  const wa = `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(message)}`;
  const copyList = () => {
    navigator.clipboard?.writeText(message);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      {count > 0 && !open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 rounded-full px-5 py-3 font-heading font-semibold text-white
                     bg-gradient-to-br from-[#f26a22] to-[#f6b02e] shadow-lg shadow-[#f26a22]/30">
          {t.btn} ({count})
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md h-full bg-background border-l border-border flex flex-col"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-heading font-bold uppercase tracking-tight">{t.title}</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground text-sm">{t.close} ✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {items.length === 0 && <p className="text-muted-foreground text-sm">{t.empty}</p>}
              {items.map(({ part, qty }) => (
                <div key={part.pn} className="bg-card border border-border rounded-lg p-3">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono font-bold text-sm break-all">{part.pn}</span>
                    <span className="text-sm whitespace-nowrap">{euro(part.price_eur * qty * VAT)} {t.vat}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{part.desc}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => setQty(part.pn, Math.max(0, qty - 1))}
                      className="w-8 h-8 rounded-lg bg-card border border-border">−</button>
                    <span className="w-8 text-center">{qty}</span>
                    <button onClick={() => setQty(part.pn, qty + 1)}
                      className="w-8 h-8 rounded-lg bg-card border border-border">+</button>
                    <button onClick={() => setQty(part.pn, 0)}
                      className="ml-auto text-xs text-muted-foreground">{t.remove}</button>
                  </div>
                </div>
              ))}
            </div>

            {items.length > 0 && (
              <div className="p-4 border-t border-border space-y-3">
                <div className="flex justify-between font-bold">
                  <span>{t.total}</span>
                  <span>{euro(gross)} {t.vat} <span className="text-muted-foreground font-normal text-sm">({euro(net)} {t.net})</span></span>
                </div>
                <a href={mailto}
                  className="block text-center w-full h-12 leading-[3rem] rounded-lg font-heading font-semibold text-white bg-primary">
                  {t.email}
                </a>
                <div className="flex gap-2">
                  <a href={wa} target="_blank" rel="noopener"
                    className="flex-1 text-center h-12 leading-[3rem] rounded-lg font-heading font-semibold bg-card border border-border">
                    {t.wa}
                  </a>
                  <button onClick={copyList}
                    className="flex-1 h-12 rounded-lg font-heading font-semibold bg-card border border-border">
                    {copied ? t.copied : t.copy}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
