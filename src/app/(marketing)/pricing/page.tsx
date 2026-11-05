import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, Lock, RotateCcw, ShieldCheck } from "lucide-react";
import { brand } from "@/lib/brand";
import { Faq } from "@/components/marketing/faq";
import { DOCUMENTS_PER_DAY, LITE_TABS } from "@/lib/plan-limits";
import { PRICES } from "@/lib/pricing";
import { PricingPlans } from "./pricing-plans";

/**
 * Pricing. It 404s in production until payments or plans are switched on, and only
 * lists what each plan really includes. With payments on and plans off, it can be used
 * to test a real purchase while nothing is locked for anyone.
 */
export const metadata: Metadata = {
  title: "Pricing",
  description: `${brand.name} plans: free for everyday PDF work, Lite for signatures, stamps and fonts from $${PRICES.lite.yearly} a month, and Pro for every feature with no document or tab limits.`,
  alternates: { canonical: "/pricing" },
};

// Only promised once payments are really switched on.
const billingOn = process.env.NEXT_PUBLIC_BILLING_ENABLED === "1";

const FAQ = [
  { q: "What's free?", a: `Everyday tools, such as merge, split, compress and rotate, and converting PDFs to Word, images and text, plus the editor for ${DOCUMENTS_PER_DAY.free} documents a day: editing text, adding text and images, highlighting, drawing and the most common fonts. There's no watermark, and you don't need an account.` },
  { q: "What's the difference between Lite and Pro?", a: `Lite adds what most people need: signatures, stamps, more than 50 extra fonts, adding pages, crop and bookmarks, up to ${LITE_TABS} tabs and ${DOCUMENTS_PER_DAY.lite} documents a day. Pro has everything in Lite with no document or tab limits, and adds redaction, form building, templates and filling forms from a spreadsheet.` },
  { q: "Can I change plans later?", a: "Yes. Start with Lite and move to Pro whenever you need more." },
  ...(billingOn ? [{ q: "Can I cancel anytime?", a: "Yes. You keep your plan until the end of the period you've paid for." }] : []),
  { q: "Do plans include tools marked Coming soon?", a: "No. Tools marked Coming soon, such as OCR and Office conversion, aren't part of any plan yet. Each plan includes exactly what's listed on this page." },
  ...(billingOn ? [
    { q: "How does billing work?", a: "Lite and Pro renew automatically each month or year, at the price you signed up for, until you cancel. Yearly plans are charged once a year for the full amount. You'll get a receipt by email each time." },
    { q: "Do you offer refunds?", a: `We don't offer refunds if you change your mind or for unused time. When you cancel, you keep your plan until the end of the period you've paid for. If something isn't working, email ${brand.supportEmail} and we'll help. This doesn't affect any rights you have under consumer law.` },
  ] : []),
  { q: "Are my documents uploaded?", a: "No. The editor and the tools on these plans run in your browser, so your file stays on your device. We never use your documents to train AI." },
];

const TRUST = [
  ...(billingOn ? [{ icon: RotateCcw, label: "Cancel anytime" }, { icon: Lock, label: "Secure checkout" }] : []),
  { icon: BadgeCheck, label: "No watermark on any plan" },
  { icon: ShieldCheck, label: "Files never used for AI" },
];

export default function PricingPage() {
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_PLANS_ENABLED && !billingOn) notFound();

  return (
    <div className="relative overflow-hidden">
      {/* soft backdrop */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent)]" aria-hidden />
      <div className="bg-dots pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden />

      <section className="wrap relative pt-20 pb-24 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-3 py-1 text-[13px] font-semibold text-accent backdrop-blur">Pricing</p>
          <h1 className="mt-5 font-display text-5xl leading-[1.02] tracking-tight sm:text-7xl">Simple pricing.<br /><span className="text-accent italic">Less</span> than the big names.</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-2">Free for everyday PDF jobs. Lite adds signatures, stamps and fonts. Pro adds everything else, with no document or tab limits.</p>
        </div>

        <PricingPlans />

        <ul className="mx-auto mt-12 flex max-w-4xl flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {TRUST.map(({ icon: Icon, label }) => (
            <li key={label} className="inline-flex items-center gap-2 text-[14px] font-medium text-ink-2"><Icon className="size-4 text-accent" aria-hidden /> {label}</li>
          ))}
        </ul>

        <section className="mx-auto mt-24 max-w-3xl" aria-labelledby="faq">
          <h2 id="faq" className="text-center font-display text-4xl tracking-tight sm:text-5xl">Questions, answered</h2>
          <div className="mt-10"><Faq items={FAQ} schema={false} /></div>
        </section>

      </section>
    </div>
  );
}
