import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, Bell, Lock, RotateCcw, ShieldCheck } from "lucide-react";
import { brand } from "@/lib/brand";
import { Faq } from "@/components/marketing/faq";
import { PricingPlans } from "./pricing-plans";

/**
 * Pricing. Draft: development only until plans and payments are live. In a
 * production build it 404s, and it isn't linked from navigation or the sitemap.
 */
export const metadata: Metadata = {
  title: "Pricing",
  description: `${brand.name} plans: free for everyday PDF work, Pro for unlimited cloud tools and big files, Business for teams.`,
  robots: { index: false, follow: false },
};

const FAQ = [
  { q: "Is the free plan really free?", a: `Yes. Every browser tool is free forever with no watermark. A free one-click Google sign-in unlocks signatures, stamps, extra pages and font styles. Cloud tools like OCR and Office conversion include 3 tasks a day.` },
  { q: "What do I get with Pro?", a: "Unlimited cloud tasks, files up to 1 GB, batch processing, signatures and stamps synced to every device, 7-day encrypted recent files and priority support." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel in one click and keep Pro until the end of the period you've paid for. Yearly plans have a 7-day money-back guarantee." },
  { q: "Do you store my documents?", a: "Browser tools never upload your files. Cloud tools delete them automatically after processing. Pro's recent files are encrypted, kept for 7 days and can be deleted at any time. We never use your documents to train AI." },
  { q: "Which payment methods do you accept?", a: "All major cards, Apple Pay and Google Pay, and PayPal in most countries. Prices are shown in your local currency where available, and sales tax or VAT is handled for you." },
  { q: "Do you offer student or non-profit discounts?", a: `Yes. Email ${brand.supportEmail} from your school or organisation address and we'll set you up with 50% off Pro.` },
];

const TRUST = [
  { icon: RotateCcw, label: "Cancel anytime" },
  { icon: BadgeCheck, label: "7-day money-back guarantee" },
  { icon: ShieldCheck, label: "Files never used for AI" },
  { icon: Lock, label: "Secure checkout" },
];

export default function PricingPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="relative overflow-hidden">
      {/* soft backdrop */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent)]" aria-hidden />
      <div className="bg-dots pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden />

      <section className="wrap relative pt-20 pb-24 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-3 py-1 text-[13px] font-semibold text-accent backdrop-blur">Pricing</p>
          <h1 className="mt-5 font-display text-5xl leading-[1.02] tracking-tight sm:text-7xl">Simple pricing.<br /><span className="text-accent italic">Free</span> where it counts.</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-2">Every browser tool stays free forever. Upgrade when you need unlimited cloud tools, bigger files and batch processing.</p>
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

        <section id="waitlist" className="mx-auto mt-24 max-w-6xl scroll-mt-28">
          <div className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#0f8a71,#063f34)] px-6 py-16 text-center text-white sm:px-16">
            <div className="pointer-events-none absolute inset-0 opacity-[.12] [background-image:radial-gradient(currentColor_1px,transparent_1.2px)] [background-size:20px_20px]" aria-hidden />
            <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold"><Bell className="size-3.5" aria-hidden /> Pro is launching soon</span>
            <h2 className="relative mt-5 font-display text-4xl leading-tight sm:text-5xl">Be first to get {brand.name} Pro</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-lg text-white/80">Early members get their first 3 months at half price.</p>
            <a href={`mailto:${brand.supportEmail}?subject=${encodeURIComponent(`${brand.name} Pro waitlist`)}`}
              className="relative mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-7 font-semibold text-[#0b6b57] shadow-lg transition hover:bg-white/90">
              Join the waitlist
            </a>
          </div>
        </section>
      </section>
    </div>
  );
}
