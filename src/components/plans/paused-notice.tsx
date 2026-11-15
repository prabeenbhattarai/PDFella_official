"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { payNow } from "@/lib/billing-client";
import { plansEnforced, usePlan } from "@/lib/plans";

const NAME = { lite: "Lite", pro: "Pro" };
const HIDDEN_ON = ["/account", "/api/admin", "/desktop-auth"];

export const pausedMessage = (plan: "lite" | "pro") =>
  `Your last payment didn't go through, so your ${NAME[plan]} features are locked until it's paid.`;

/** Pays the unpaid invoice on Stripe's page. */
export function PayNowButton({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button size={size} className={className} disabled={busy} data-testid="pay-now"
      onClick={async () => {
        setBusy(true);
        try { await payNow(); } catch (e) { toast.error("Couldn't open the payment page", (e as Error).message); setBusy(false); }
      }}>
      {busy ? <Loader2 className="animate-spin" /> : <CreditCard />} Pay now
    </Button>
  );
}

/** Shown across the site while a subscription is paused for a failed payment. */
export function PausedBanner() {
  const paused = usePlan((s) => s.paused);
  const pathname = usePathname();
  if (!paused || !plansEnforced() || HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;
  return (
    <div role="alert" data-testid="paused-banner" className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-2xl border border-warn/40 bg-surface px-4 py-3 shadow-lg sm:inset-x-6">
      <AlertTriangle className="size-5 shrink-0 text-warn" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">Your subscription is paused</p>
        <p className="text-[13px] text-ink-2">{pausedMessage(paused.plan)}</p>
      </div>
      <PayNowButton />
    </div>
  );
}
