"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/store";
import { openBillingPortal, waitForPlan } from "@/lib/billing-client";
import { usePlan, useTier } from "@/lib/plans";
import { rewardLabel } from "@/lib/reward";
import { PRICES } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { SubscriptionView } from "@/lib/server/billing-plan";
import { CancelDialog, CancelZone, SorryDialog } from "./cancel-zone";

type Billing = "monthly" | "yearly";
type Plan = "lite" | "pro";
interface Choice { plan: Plan; billing: Billing }
type Current = SubscriptionView & { billing: Billing | null; pending: (Choice & { at: string }) | null };
const OPTIONS: Choice[] = [{ plan: "lite", billing: "monthly" }, { plan: "lite", billing: "yearly" }, { plan: "pro", billing: "monthly" }, { plan: "pro", billing: "yearly" }];
const priceLine = ({ plan, billing }: Choice) => (billing === "yearly" ? `$${PRICES[plan].yearly * 12} a year` : `$${PRICES[plan].monthly} a month`);
const NAME = { lite: "Lite", pro: "Pro" };

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "long" }) : "—");
const money = (cents: number | null, currency: string | null) => (cents === null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: currency ?? "usd" }).format(cents / 100));
const NAMES = { free: "Free", lite: "Lite", pro: "Pro" };

async function call(init?: RequestInit): Promise<{ subscription?: Current | null; timing?: "now" | "period_end"; charge?: { amount: number; currency: string } | null }> {
  const { currentIdToken } = await import("@/lib/auth/firebase");
  const token = await currentIdToken();
  const res = await fetch("/api/billing/subscription", { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? "Something went wrong. Please try again.");
  return body;
}

export function AccountPanel() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const tier = useTier();
  const reward = usePlan((s) => s.reward);
  const [sub, setSub] = useState<Current | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"cancel" | "resume" | "portal" | "switch" | "keep" | "preview" | null>(null);
  const [changing, setChanging] = useState<{ to: Choice; timing: "now" | "period_end"; charge: { amount: number; currency: string } | null } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sorry, setSorry] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try { setSub((await call()).subscription ?? null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { if (user) void load(); }, [user, load]);

  const change = async (cancel: boolean) => {
    setBusy(cancel ? "cancel" : "resume");
    try {
      setSub((await call({ method: "POST", body: JSON.stringify({ action: cancel ? "cancel" : "resume" }) })).subscription ?? null);
      setConfirming(false);
      void waitForPlan(1);
      if (cancel) setSorry(true);
      else toast.success("You got your plan back", "It will renew as normal.");
    } catch (e) {
      toast.error("Couldn't update your subscription", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const review = async (to: Choice) => {
    setBusy("preview");
    try {
      const r = await call({ method: "POST", body: JSON.stringify({ action: "preview", ...to }) });
      setChanging({ to, timing: r.timing!, charge: r.charge ?? null });
    } catch (e) {
      toast.error("Couldn't check that change", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const applyChange = async () => {
    if (!changing) return;
    setBusy("switch");
    try {
      setSub((await call({ method: "POST", body: JSON.stringify({ action: "switch", ...changing.to }) })).subscription ?? null);
      void waitForPlan(1);
      toast.success(changing.timing === "now" ? `You're now on ${NAME[changing.to.plan]}` : "Your plan change is booked", changing.timing === "now" ? "Everything in your new plan is unlocked." : "You keep your current plan until the end of the period you've paid for.");
      setChanging(null);
    } catch (e) {
      toast.error("Your plan hasn't changed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const keepPlan = async () => {
    setBusy("keep");
    try {
      setSub((await call({ method: "POST", body: JSON.stringify({ action: "keep-plan" }) })).subscription ?? null);
      toast.success("You're staying on your current plan");
    } catch (e) {
      toast.error("Couldn't update your subscription", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const portal = async () => {
    setBusy("portal");
    try { await openBillingPortal(); } catch (e) { toast.error("Couldn't open billing", (e as Error).message); setBusy(null); }
  };

  const card = "mt-8 rounded-2xl border border-border bg-surface p-6";
  if (!ready) return <div className={`${card} h-48 animate-pulse`} />;
  if (!user) {
    return (
      <div className={card} data-testid="account-signed-out">
        <p className="text-[15px] text-ink-2">Sign in to see your plan and manage your subscription.</p>
        <Button className="mt-4" onClick={() => useAuth.getState().openPrompt("checkout")}>Sign in</Button>
      </div>
    );
  }

  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 py-2.5 text-[14.5px]"><dt className="text-ink-3">{k}</dt><dd className="text-right font-medium text-ink">{v}</dd></div>;
  const ending = sub?.cancelsAtEnd;

  return (
    <>
      <div className={card}>
        <dl className="divide-y divide-border">
          {row("Email", user.email ?? "—")}
          {row("Plan", sub ? NAMES[sub.plan ?? tier] : NAMES[tier])}
          {reward && row("Free feature", `${rewardLabel(reward.feature)}, until ${day(reward.until)}`)}
          {sub && row("Price", `${money(sub.amount, sub.currency)} a ${sub.interval ?? "period"}`)}
          {sub && row(ending ? "Your plan ends" : "Next payment", day(sub.periodEnd))}
        </dl>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-[14px] text-danger">{error}</p>}

      {sub === undefined && !error && <div className="mt-6 flex justify-center text-ink-3"><Loader2 className="size-5 animate-spin" aria-label="Loading" /></div>}

      {sub?.status === "past_due" && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-warn/10 px-4 py-3 text-[14px] text-ink-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" /> Your last payment didn&apos;t go through. We&apos;ll try again over the next few days, and you keep your plan in the meantime. Update your card to avoid losing it.</p>
      )}

      {sub?.pending && !ending && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3 text-[14px] text-ink-2" data-testid="pending-change">
          <span>You keep {NAMES[sub.plan ?? tier]} until {day(sub.pending.at)}, then move to {NAME[sub.pending.plan]} at {priceLine(sub.pending)}.</span>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void keepPlan()}>Stay on {NAMES[sub.plan ?? tier]}</Button>
        </div>
      )}

      {sub === null && !error && (
        <div className="mt-6">
          <p className="text-[14.5px] text-ink-2">{tier === "free" ? "You're on the Free plan." : "Your plan was added to your account, so there's nothing to pay or cancel."}</p>
          {tier === "free" && <Link href="/pricing" className="mt-3 inline-flex items-center gap-2 font-semibold text-accent hover:underline">See plans <ArrowRight className="size-4" /></Link>}
        </div>
      )}

      {sub && (
        <div className={card}>
          <h2 className="text-[16px] font-semibold tracking-tight">Change plan</h2>
          <p className="mt-1 text-[13.5px] text-ink-3">{ending ? "Your subscription is cancelled, so its plan can't be changed." : "Moving up starts now, and you pay the difference. Moving down starts when your paid period ends, so you keep what you've paid for."}</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {OPTIONS.map((o) => {
              const current = o.plan === sub.plan && o.billing === sub.billing;
              return (
                <li key={`${o.plan}-${o.billing}`}>
                  <button type="button" disabled={current || !!busy || !!ending} onClick={() => void review(o)} data-testid={`switch-${o.plan}-${o.billing}`}
                    className={cn("flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-[14px] transition", current ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong hover:bg-surface-2 disabled:opacity-60")}>
                    <span className="font-semibold text-ink">{NAME[o.plan]} {o.billing}</span>
                    <span className="text-ink-2">{current ? "Your plan" : priceLine(o)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {sub && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="outline" disabled={!!busy} onClick={() => void portal()}>{busy === "portal" ? <Loader2 className="animate-spin" /> : <CreditCard />} Update card and see invoices</Button>
        </div>
      )}

      {sub && (
        <CancelZone planName={NAMES[sub.plan ?? tier]} periodEnd={day(sub.periodEnd)} cancelled={!!ending} undoUntil={sub.undoUntil} busy={busy === "resume"} onCancel={() => setConfirming(true)} onUndo={() => void change(false)} />
      )}

      <Dialog open={!!changing} onClose={() => setChanging(null)} title={changing ? `Switch to ${NAME[changing.to.plan]} ${changing.to.billing}?` : ""}
        description={changing ? (changing.timing === "now"
          ? `You'll pay ${money(changing.charge?.amount ?? null, changing.charge?.currency ?? null)} today, which accounts for what you've already paid. Your new plan starts straight away, then ${priceLine(changing.to)}.`
          : `You keep ${NAMES[sub?.plan ?? tier]} until ${day(sub?.periodEnd ?? null)}, with nothing to pay now. Then you move to ${NAME[changing.to.plan]} at ${priceLine(changing.to)}.`) : undefined}
        footer={<><Button variant="ghost" onClick={() => setChanging(null)}>Not now</Button><Button disabled={busy === "switch"} onClick={() => void applyChange()}>{busy === "switch" && <Loader2 className="animate-spin" />} Confirm</Button></>}>
        <p className="text-[14px] text-ink-3">You can cancel at any time.</p>
      </Dialog>

      <CancelDialog open={confirming} planName={NAMES[sub?.plan ?? tier]} periodEnd={day(sub?.periodEnd ?? null)} busy={busy === "cancel"} onClose={() => setConfirming(false)} onConfirm={() => void change(true)} />
      <SorryDialog open={sorry} planName={NAMES[sub?.plan ?? tier]} periodEnd={day(sub?.periodEnd ?? null)} onClose={() => setSorry(false)} />
    </>
  );
}
