"use client";

import Link from "next/link";
import { ArrowRight, Check, Crown } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { authEnabled, useAuth } from "@/lib/auth/store";
import { currentTier, planToOffer, usePlan, type PlanFeature } from "@/lib/plans";
import { DOCUMENTS_PER_DAY, LITE_TABS } from "@/lib/plan-limits";
import { isDesktopApp } from "@/lib/auth/desktop";
import { PRICES } from "@/lib/pricing";
import { billingEnabled } from "@/lib/billing-client";

const COPY: Record<Exclude<PlanFeature, "documents">, { title: string; body: string }> = {
  tabs: { title: "Work in several tabs", body: "Open documents side by side, each in its own tab, and copy between them." },
  "more-tabs": { title: "Open unlimited tabs", body: `Lite includes ${LITE_TABS} tabs at once. Pro has no limit.` },
  signature: { title: "Sign documents", body: "Draw, type or upload your signature and place it anywhere." },
  stamp: { title: "Use stamps", body: "Approved, Draft, Confidential and stamps you design yourself." },
  fonts: { title: "Get every font", body: "The common fonts are free. Paid plans unlock more than 50 others for headings, branding and handwriting." },
  pages: { title: "Add pages", body: "Insert blank pages, other PDFs and images anywhere in your document." },
  redact: { title: "Redact", body: "Permanently remove sensitive text and areas, not just cover them." },
  forms: { title: "Build forms", body: "Add text fields, checkboxes, dropdowns and signature fields to any PDF." },
  crop: { title: "Crop in the editor", body: "Trim margins or cut pages to size without leaving your document." },
  bookmarks: { title: "Edit bookmarks", body: "Build a clickable table of contents right in the editor." },
  templates: { title: "Save templates", body: "Keep the forms and contracts you use often, ready to fill again." },
  "bulk-fill": { title: "Fill from a spreadsheet", body: "Create a filled PDF for every row of a CSV or Excel file." },
};

const PLAN = {
  lite: { name: "Lite", benefits: [`${DOCUMENTS_PER_DAY.lite} documents a day`, `Up to ${LITE_TABS} tabs`, "Signatures and stamps", "50+ extra fonts", "Add pages", "Crop and bookmarks in the editor"] },
  pro: { name: "Pro", benefits: ["Unlimited documents", "Unlimited tabs", "Everything in Lite", "Redaction and form building", "Templates", "Filling forms from a spreadsheet"] },
};

/** Shown whenever a visitor reaches for something their plan doesn't include. */
export function UpgradeDialog() {
  const upgrade = usePlan((s) => s.upgrade);
  const close = usePlan((s) => s.closeUpgrade);
  const signedIn = useAuth((s) => !!s.user);
  if (!upgrade) return null;
  const target = planToOffer(upgrade.feature);
  const plan = PLAN[target];
  const copy = upgrade.feature === "documents"
    ? { title: "You've reached today's limit", body: `Your plan includes ${DOCUMENTS_PER_DAY[currentTier()]} documents a day. Upgrade to ${plan.name} for ${target === "pro" ? "unlimited documents" : `${DOCUMENTS_PER_DAY.lite} a day`}, or come back tomorrow.` }
    : { ...COPY[upgrade.feature], title: `${COPY[upgrade.feature].title} with ${plan.name}` };
  return (
    <Dialog open onClose={close} title={copy.title} description={copy.body}>
      <div data-testid="upgrade-dialog" data-feature={upgrade.feature} data-plan={target}>
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent"><Crown className="size-3.5" aria-hidden /> Premium feature</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {plan.benefits.map((b) => <li key={b} className="flex items-center gap-2 text-[13.5px] text-ink-2"><Check className="size-4 shrink-0 text-accent" aria-hidden /> {b}</li>)}
        </ul>
        <p className="mt-4 text-[14px] text-ink-2"><span className="font-semibold text-ink">{plan.name} from ${PRICES[target].yearly} a month</span>, billed yearly, or ${PRICES[target].monthly} monthly.{billingEnabled && " Cancel anytime."}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {/* A new tab keeps the document open, except in the desktop app, which has one window. */}
          <Link href="/pricing" target={isDesktopApp() ? undefined : "_blank"} onClick={close}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-semibold text-white transition hover:opacity-90">
            See plans <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Button size="lg" variant="ghost" onClick={close}>Not now</Button>
        </div>
        {authEnabled && !signedIn && (
          <p className="mt-3 text-center text-[13px] text-ink-3">
            Already have a plan?{" "}
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => { close(); useAuth.getState().openPrompt("editor"); }}>Sign in</button>
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** A crown in the corner of a locked button, where a label wouldn't fit. */
export function ProCrown({ className = "" }: { className?: string }) {
  return <span title="Paid feature" className={`absolute flex size-3.5 items-center justify-center rounded-full bg-[#ffc83d] text-[#3d2b00] ${className}`}><Crown className="!size-2.5" strokeWidth={2.5} aria-hidden /></span>;
}

/** Small marker for a locked option. */
export function ProBadge({ label = "PRO", className = "" }: { label?: "LITE" | "PRO"; className?: string }) {
  return <span className={`inline-flex items-center gap-0.5 rounded bg-[#ffc83d] px-1 text-[9.5px] leading-[14px] font-bold text-[#3d2b00] ${className}`}><Crown className="size-2.5" aria-hidden /> {label}</span>;
}
