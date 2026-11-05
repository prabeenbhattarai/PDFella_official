"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Crown, Feather, Loader2, Minus, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";
import { DOCUMENTS_PER_DAY, LITE_TABS } from "@/lib/plan-limits";
import { PRICES } from "@/lib/pricing";
import { billingEnabled, startCheckout, waitForPlan } from "@/lib/billing-client";
import { useTier } from "@/lib/plans";
import { toast } from "@/components/ui/toast";
import { PlanDemo } from "@/components/marketing/plan-demo";

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

const WAITLIST = (plan: string) => `mailto:${brand.supportEmail}?subject=${encodeURIComponent(`${brand.name} ${plan}`)}`;
const PLANS: Plan[] = [
  {
    id: "free", name: "Free", icon: Zap, tagline: "For everyday PDF jobs.",
    price: { yearly: 0, monthly: 0 },
    cta: { label: "Start for free", href: "/editor" },
    features: [
      `Edit ${DOCUMENTS_PER_DAY.free} documents a day`,
      "Edit text, add text and images, highlight and draw",
      "Merge, split, rotate and compress",
      "Convert PDFs to Word, images and text",
      "The common fonts, such as Arial and Times look-alikes",
      "Files up to 100 MB, with no watermark",
      "The desktop app for Mac and Windows",
    ],
  },
  {
    id: "lite", name: "Lite", icon: Feather, tagline: "For signing and polishing documents.",
    price: PRICES.lite, unit: "/month",
    cta: { label: "Get Lite", href: WAITLIST("Lite") },
    includesFrom: "Everything in Free, plus",
    features: [
      `Edit ${DOCUMENTS_PER_DAY.lite} documents a day`,
      `Up to ${LITE_TABS} tabs at once`,
      "Signatures and stamps, including your own",
      "More than 50 extra fonts",
      "Add pages",
      "Crop and bookmarks in the editor",
      "Files up to 250 MB",
    ],
  },
  {
    id: "pro", name: "Pro", icon: Crown, tagline: "For people who work with PDFs every day.",
    price: PRICES.pro, unit: "/month",
    cta: { label: "Get Pro", href: WAITLIST("Pro") },
    highlight: true, includesFrom: "Everything in Lite, plus",
    features: [
      "Unlimited documents",
      "Unlimited tabs",
      "Redaction that permanently removes content",
      "Build forms",
      "Templates",
      "Fill forms from a spreadsheet",
      "Files up to 500 MB",
    ],
  },
];

type Cell = boolean | string;
const COMPARE: { group: string; rows: [string, Cell, Cell, Cell][] }[] = [
  {
    group: "Editor",
    rows: [
      ["Documents you can edit", `${DOCUMENTS_PER_DAY.free} a day`, `${DOCUMENTS_PER_DAY.lite} a day`, "Unlimited"],
      ["Edit text, add text and images, highlight, draw, shapes", true, true, true],
      ["Tabs at once", "1", `${LITE_TABS}`, "Unlimited"],
      ["Fonts", "Common fonts", "50+ more", "50+ more"],
      ["Signatures", false, true, true],
      ["Stamps, including your own", false, true, true],
      ["Add pages", false, true, true],
      ["Crop and bookmarks in the editor", false, true, true],
      ["Redaction", false, false, true],
      ["Build forms", false, false, true],
    ],
  },
  {
    group: "Other tools",
    rows: [
      ["Desktop app for Mac and Windows", true, true, true],
      ["Merge, split, rotate, compress", true, true, true],
      ["Convert PDFs to Word, images and text", true, true, true],
      ["Templates", false, false, true],
      ["Fill forms from a spreadsheet", false, false, true],
    ],
  },
  {
    group: "Limits",
    rows: [
      ["Maximum file size", "100 MB", "250 MB", "500 MB"],
      ["Watermark", "None", "None", "None"],
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
  const saving = (plan.price.monthly - plan.price.yearly) * 12;
  const tier = useTier();
  const mine = tier === plan.id;
  const label = plan.id === "free" ? plan.cta.label : mine ? "Manage your plan" : tier === "free" ? plan.cta.label : `Switch to ${plan.name}`;
  const [busy, setBusy] = useState(false);
  const buy = async () => {
    setBusy(true);
    try {
      if (tier !== "free") location.href = "/account";
      else await startCheckout(plan.id as "lite" | "pro", billing, (message) => toast.error("Couldn't open the checkout", message));
    } catch (e) {
      toast.error("Couldn't open the checkout", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ctaClass = cn(
    "relative mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition disabled:opacity-60",
    hi ? "bg-white text-[#0b6b57] shadow-lg hover:bg-white/90" : plan.id === "free" ? "bg-ink text-bg hover:opacity-90" : "border border-border-strong text-ink hover:bg-surface-2",
  );
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
            <Sparkles className="size-3.5" aria-hidden /> Everything included
          </span>
        </>
      )}
      <div className="relative flex items-center gap-3">
        <span className={cn("flex size-10 items-center justify-center rounded-xl", hi ? "bg-white/15" : "bg-accent-soft text-accent")}><Icon className="size-5" aria-hidden /></span>
        <div>
          <h3 className="flex items-center gap-2 text-[19px] font-semibold tracking-tight">{plan.name}{mine && <span data-testid="your-plan" className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", hi ? "bg-white/20 text-white" : "bg-accent-soft text-accent")}>Your plan</span>}</h3>
          <p className={cn("text-[13.5px]", hi ? "text-white/75" : "text-ink-3")}>{plan.tagline}</p>
        </div>
      </div>

      <div className="relative">
        <Price plan={plan} billing={billing} />
        <p className={cn("mt-2 h-5 text-[13px]", hi ? "text-white/75" : "text-ink-3")}>
          {plan.price.monthly === 0 ? "No account needed" : billing === "yearly" ? <>Billed ${plan.price.yearly * 12} yearly · <span className={cn("font-semibold", hi ? "text-[#ffd76a]" : "text-accent")}>save ${saving}</span></> : "Billed monthly, cancel anytime"}
        </p>
      </div>

      {billingEnabled && plan.id !== "free" ? (
        <button type="button" disabled={busy} onClick={() => void buy()} className={ctaClass}>
          {label} {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
        </button>
      ) : (
        <Link href={plan.cta.href} className={ctaClass}>{label} <ArrowRight className="size-4" aria-hidden /></Link>
      )}

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

  // Back from Stripe after paying: the plan switches on as soon as Stripe confirms it.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("checkout") !== "success") return;
    history.replaceState(null, "", "/pricing");
    void waitForPlan().then((ready) => {
      if (ready) toast.success("Your plan is active", "Thanks for upgrading. Everything's unlocked.");
      else toast.info("Your payment went through", "Your plan will switch on in a moment. Refresh this page if it doesn't.");
    });
  }, []);
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

      <p className="mt-8 text-center text-[13.5px] text-ink-3">Prices are in US dollars. Your bank may add a currency conversion fee.{billingEnabled && " You'll sign in with Google before paying, so your plan stays on your account."}</p>

      {/* Animated demo */}
      <section className="mx-auto mt-24 max-w-6xl" aria-labelledby="see-plans">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[13px] font-semibold tracking-[0.12em] text-accent uppercase">See it in action</p>
          <h2 id="see-plans" className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-5xl">What each plan <em className="text-accent">unlocks</em></h2>
          <p className="mt-3 text-lg text-ink-2">Watch each plan at work in the editor, and see where the next one takes over.</p>
        </div>
        <div className="mt-10"><PlanDemo /></div>
      </section>

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
          {cells.map((c, i) => <td key={i} className={cn("px-4 py-3.5 text-center", i === 2 && "bg-accent-soft/40")}><CellValue v={c} /></td>)}
        </tr>
      ))}
    </>
  );
}
