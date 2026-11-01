"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, Check, Code2, Crown, Minus, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";

type Billing = "yearly" | "monthly";

interface Plan {
  id: string;
  name: string;
  icon: typeof Zap;
  tagline: string;
  price: { yearly: number; monthly: number };
  unit?: string;
  cta: { label: string; href: string };
  highlight?: boolean;
  includesFrom?: string;
  features: string[];
}

const SALES = `mailto:${brand.supportEmail}?subject=${encodeURIComponent(`${brand.name} Business`)}`;

const PLANS: Plan[] = [
  {
    id: "free", name: "Free", icon: Zap, tagline: "For everyday PDF jobs.",
    price: { yearly: 0, monthly: 0 },
    cta: { label: "Start for free", href: "/editor" },
    features: [
      "Every browser tool: edit, merge, split, compress, convert",
      "Signatures, stamps and fonts with a free sign-in",
      "3 cloud tasks a day (OCR, Office ↔ PDF)",
      "Files up to 50 MB",
      "No watermark, ever",
    ],
  },
  {
    id: "pro", name: "Pro", icon: Crown, tagline: "For people who live in PDFs.",
    price: { yearly: 6, monthly: 9 }, unit: "/month",
    cta: { label: "Upgrade to Pro", href: "#waitlist" },
    highlight: true, includesFrom: "Everything in Free, plus",
    features: [
      "Unlimited cloud tasks (fair use)",
      "Files up to 1 GB",
      "Batch processing: many files at once",
      "Signatures and stamps saved on every device",
      "7-day encrypted recent files",
      "Priority processing and email support",
    ],
  },
  {
    id: "business", name: "Business", icon: Building2, tagline: "For teams that share documents.",
    price: { yearly: 12, monthly: 15 }, unit: "/user/month",
    cta: { label: "Talk to us", href: SALES },
    includesFrom: "Everything in Pro, plus",
    features: [
      "Files up to 4 GB",
      "Team admin and central billing",
      "Shared signatures, stamps and templates",
      "30-day encrypted file history",
      "Invoices with company and tax details",
      "Priority same-day support",
    ],
  },
];

type Cell = boolean | string;
const COMPARE: { group: string; rows: [string, Cell, Cell, Cell][] }[] = [
  {
    group: "Tools",
    rows: [
      ["Edit, merge, split, rotate, compress", true, true, true],
      ["Convert PDF ↔ Word, Excel, PowerPoint, images", true, true, true],
      ["Signatures, stamps, extra pages, fonts", "Free sign-in", true, true],
      ["OCR and Office conversions", "3 / day", "Unlimited", "Unlimited"],
      ["Batch processing", false, true, true],
    ],
  },
  {
    group: "Limits",
    rows: [
      ["Maximum file size", "50 MB", "1 GB", "4 GB"],
      ["Processing priority", "Standard", "Priority", "Priority"],
      ["Recent files", false, "7 days", "30 days"],
    ],
  },
  {
    group: "Team & support",
    rows: [
      ["Team members", false, false, "2+"],
      ["Shared templates", false, false, true],
      ["Support", "Help centre", "Email, 24 h", "Same day"],
    ],
  },
];

function Price({ plan, billing }: { plan: Plan; billing: Billing }) {
  const value = plan.price[billing];
  return (
    <div className="mt-6 flex items-end gap-1.5">
      <span className="font-display text-[56px] leading-none tracking-tight">${value}</span>
      <span className={cn("pb-2 text-[14px]", plan.highlight ? "text-white/70" : "text-ink-3")}>{value === 0 ? "forever" : plan.unit}</span>
    </div>
  );
}

function PlanCard({ plan, billing }: { plan: Plan; billing: Billing }) {
  const Icon = plan.icon;
  const hi = plan.highlight;
  const saving = plan.price.monthly && billing === "yearly" ? (plan.price.monthly - plan.price.yearly) * 12 : 0;
  return (
    <div className={cn(
      "relative flex flex-col rounded-3xl p-7 transition-transform duration-300 hover:-translate-y-1",
      hi
        ? "bg-[linear-gradient(160deg,#0f8a71_0%,#0b6b57_50%,#063f34_100%)] text-white shadow-[0_30px_70px_-25px_rgb(6_63_52/0.7)] lg:-my-4 lg:py-11"
        : "border border-border bg-surface",
    )}>
      {hi && (
        <>
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden>
            <div className="absolute -top-20 -right-16 size-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:26px_26px]" />
          </div>
          <span className="absolute -top-3.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#ffc83d] px-3 py-1 text-[12px] font-bold text-[#3d2b00] shadow-md">
            <Sparkles className="size-3.5" aria-hidden /> Most popular
          </span>
        </>
      )}
      <div className="relative flex items-center gap-3">
        <span className={cn("flex size-10 items-center justify-center rounded-xl", hi ? "bg-white/15" : "bg-accent-soft text-accent")}><Icon className="size-5" aria-hidden /></span>
        <div>
          <h3 className="text-[19px] font-semibold tracking-tight">{plan.name}</h3>
          <p className={cn("text-[13.5px]", hi ? "text-white/75" : "text-ink-3")}>{plan.tagline}</p>
        </div>
      </div>

      <div className="relative">
        <Price plan={plan} billing={billing} />
        <p className={cn("mt-2 h-5 text-[13px]", hi ? "text-white/75" : "text-ink-3")}>
          {plan.price.monthly === 0 ? "No card needed" : billing === "yearly" ? <>Billed ${plan.price.yearly * 12} yearly · <span className={cn("font-semibold", hi ? "text-[#ffd76a]" : "text-accent")}>save ${saving}</span></> : "Billed monthly, cancel anytime"}
        </p>
      </div>

      <Link href={plan.cta.href}
        className={cn(
          "relative mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition",
          hi ? "bg-white text-[#0b6b57] shadow-lg hover:bg-white/90" : plan.id === "free" ? "bg-ink text-bg hover:opacity-90" : "border border-border-strong text-ink hover:bg-surface-2",
        )}>
        {plan.cta.label} <ArrowRight className="size-4" aria-hidden />
      </Link>

      <div className={cn("relative mt-7 border-t pt-6", hi ? "border-white/15" : "border-border")}>
        {plan.includesFrom && <p className={cn("mb-3 text-[12.5px] font-semibold tracking-wide uppercase", hi ? "text-white/70" : "text-ink-3")}>{plan.includesFrom}</p>}
        <ul className="space-y-3">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-[14.5px] leading-snug">
              <span className={cn("mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full", hi ? "bg-white/20" : "bg-accent-soft text-accent")}><Check className="size-3" strokeWidth={3} aria-hidden /></span>
              <span className={hi ? "text-white/95" : "text-ink-2"}>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CellValue({ v }: { v: Cell }) {
  if (v === true) return <Check className="mx-auto size-5 text-accent" aria-label="Included" />;
  if (v === false) return <Minus className="mx-auto size-4 text-ink-3/50" aria-label="Not included" />;
  return <span className="text-[13.5px] text-ink-2">{v}</span>;
}

export function PricingPlans() {
  const [billing, setBilling] = useState<Billing>("yearly");
  return (
    <>
      {/* Billing toggle */}
      <div className="mt-10 flex justify-center">
        <div className="relative inline-flex rounded-full border border-border bg-surface p-1 shadow-sm" role="radiogroup" aria-label="Billing period">
          <span aria-hidden className={cn("absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-ink transition-transform duration-300", billing === "yearly" ? "translate-x-0" : "translate-x-[calc(100%+0px)]")} style={{ left: 4 }} />
          {(["yearly", "monthly"] as const).map((b) => (
            <button key={b} type="button" role="radio" aria-checked={billing === b} onClick={() => setBilling(b)}
              className={cn("relative z-10 flex h-10 w-36 items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold transition-colors", billing === b ? "text-bg" : "text-ink-2 hover:text-ink")}>
              {b === "yearly" ? "Yearly" : "Monthly"}
              {b === "yearly" && <span className={cn("rounded-full px-1.5 py-px text-[11px] font-bold", billing === b ? "bg-[#ffc83d] text-[#3d2b00]" : "bg-accent-soft text-accent")}>−33%</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Plans */}
      <div className="mx-auto mt-14 grid max-w-6xl items-stretch gap-6 lg:grid-cols-3 lg:gap-5">
        {PLANS.map((p) => <PlanCard key={p.id} plan={p} billing={billing} />)}
      </div>

      {/* API strip */}
      <div className="mx-auto mt-10 max-w-6xl overflow-hidden rounded-3xl border border-border bg-surface">
        <div className="grid gap-6 p-7 md:grid-cols-[1.2fr_2fr] md:items-center md:p-8">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--cat-convert)_12%,transparent)] px-2.5 py-1 text-[12px] font-semibold text-[var(--cat-convert)]"><Code2 className="size-3.5" /> For developers</span>
            <h3 className="mt-3 text-[22px] font-semibold tracking-tight">{brand.name} API</h3>
            <p className="mt-1.5 text-[14.5px] text-ink-3">Merge, split, watermark, protect and convert from your own app, with the same engine.</p>
            <Link href="/developers" className="mt-4 inline-flex items-center gap-1 text-[14px] font-semibold text-accent hover:underline">Read the docs <ArrowRight className="size-3.5" /></Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { n: "Starter", p: "Free", d: "500 requests / month", s: "20 per minute" },
              { n: "Growth", p: "$29/mo", d: "20,000 requests / month", s: "then $1.50 per 1,000" },
              { n: "Enterprise", p: "Custom", d: "Volume and SLA", s: "Dedicated support" },
            ].map((t) => (
              <div key={t.n} className="rounded-2xl border border-border bg-bg p-4">
                <p className="text-[13px] font-semibold text-ink-3">{t.n}</p>
                <p className="mt-1 text-[22px] font-semibold tracking-tight">{t.p}</p>
                <p className="mt-1 text-[13px] text-ink-2">{t.d}</p>
                <p className="text-[12.5px] text-ink-3">{t.s}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison */}
      <section className="mx-auto mt-24 max-w-5xl" aria-labelledby="compare">
        <h2 id="compare" className="text-center font-display text-4xl tracking-tight sm:text-5xl">Compare plans</h2>
        <div className="mt-10 overflow-x-auto rounded-3xl border border-border bg-surface">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-6 py-5 text-[13px] font-medium text-ink-3">Features</th>
                {PLANS.map((p) => (
                  <th key={p.id} className={cn("px-4 py-5 text-center", p.highlight && "bg-accent-soft/60")}>
                    <span className="block text-[15px] font-semibold">{p.name}</span>
                    <span className="block text-[12.5px] font-normal text-ink-3">{p.price[billing] === 0 ? "Free" : `$${p.price[billing]}${p.unit}`}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((g) => (
                <FragmentRows key={g.group} group={g.group} rows={g.rows} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function FragmentRows({ group, rows }: { group: string; rows: [string, Cell, Cell, Cell][] }) {
  return (
    <>
      <tr><td colSpan={4} className="bg-surface-2/60 px-6 py-2.5 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">{group}</td></tr>
      {rows.map(([label, ...cells]) => (
        <tr key={label} className="border-t border-border">
          <td className="px-6 py-3.5 text-[14.5px] text-ink">{label}</td>
          {cells.map((c, i) => <td key={i} className={cn("px-4 py-3.5 text-center", i === 1 && "bg-accent-soft/40")}><CellValue v={c} /></td>)}
        </tr>
      ))}
    </>
  );
}
