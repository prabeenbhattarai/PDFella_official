"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Gift, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { authEnabled, requireAuth, useAuth } from "@/lib/auth/store";
import { currentTier, plansEnforced, usePlan } from "@/lib/plans";
import { activeReward, REWARD_FEATURES, REWARD_HOURS, REWARD_SOURCES, rewardLabel, type RewardFeature } from "@/lib/reward";
import { cn } from "@/lib/utils";

const SEEN = "pdfella.welcome-survey";
const DELAY_MS = 8000;
const HIDDEN_ON = ["/api/admin", "/desktop-auth", "/s/", "/privacy", "/terms"];

const seen = () => { try { return localStorage.getItem(SEEN) === "1"; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(SEEN, "1"); } catch { /* storage blocked */ } };

async function token() {
  if (!authEnabled || !useAuth.getState().user) return null;
  const { currentIdToken } = await import("@/lib/auth/firebase");
  return currentIdToken();
}

/**
 * Offered once to first-time visitors. The server decides who qualifies, and refuses a
 * second claim from the same account or IP, so clearing browser data doesn't help.
 */
export function WelcomeSurvey() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [feature, setFeature] = useState<RewardFeature | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [won, setWon] = useState<{ feature: string; until: string } | null>(null);

  useEffect(() => {
    if (!plansEnforced() || seen() || navigator.webdriver || HIDDEN_ON.some((p) => pathname.startsWith(p))) return;
    let alive = true;
    const offer = async () => {
      if (!alive || seen()) return;
      // Never on top of something they're already doing.
      if (document.querySelector('[role="dialog"]')) { timer = setTimeout(() => void offer(), DELAY_MS); return; }
      const t = await token().catch(() => null);
      if (currentTier() !== "free") return;
      const res = await fetch("/api/reward", { headers: t ? { Authorization: `Bearer ${t}` } : {}, cache: "no-store" }).catch(() => null);
      const body = await res?.json().catch(() => null);
      if (alive && body?.eligible) setOpen(true);
      else if (alive && res?.ok) markSeen();
    };
    let timer = setTimeout(() => void offer(), DELAY_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [pathname]);

  const close = () => { markSeen(); setOpen(false); };

  const claim = async () => {
    setError(null);
    setBusy(true);
    try {
      const t = await token();
      if (!t) throw new Error("Please sign in to claim your free feature.");
      const res = await fetch("/api/reward", { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ source, feature }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? "We couldn't save that. Please try again.");
      markSeen();
      setWon(body);
      // The reward arrives in a fresh sign-in token, like a plan does.
      const { getFirebaseAuth } = await import("@/lib/auth/firebase");
      const result = await (await getFirebaseAuth()).currentUser?.getIdTokenResult(true);
      usePlan.getState().setReward(activeReward(result?.claims.welcomeReward));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    if (requireAuth("reward", () => { setOpen(true); void claim(); })) void claim();
  };

  if (!open) return null;
  if (won) {
    return (
      <Dialog open onClose={() => setOpen(false)} size="sm" title="Thanks! You're all set" footer={<Button className="w-full" onClick={() => { setOpen(false); toast.success(`${rewardLabel(won.feature)} unlocked`, `Free until ${new Date(won.until).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`); }}>Start using it</Button>}>
        <p className="flex items-start gap-2 text-[14px] text-ink-2" data-testid="reward-won"><Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> <span><strong className="text-ink">{rewardLabel(won.feature)}</strong> is unlocked until {new Date(won.until).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.</span></p>
      </Dialog>
    );
  }
  return (
    <Dialog open onClose={close} title="How did you hear about us?" description={`Tell us, and try one paid feature free for ${REWARD_HOURS} hours. It's a one-time offer for first-time users.`}
      footer={<><Button variant="ghost" onClick={close}>No thanks</Button><Button disabled={!source || !feature || busy} onClick={submit} data-testid="reward-claim">{busy ? <Loader2 className="animate-spin" /> : <Gift />} Claim my free feature</Button></>}>
      <div className="space-y-4" data-testid="welcome-survey">
        <div>
          <label htmlFor="reward-source" className="mb-1.5 block text-[13.5px] font-medium text-ink">How did you find PDFella?</label>
          <Select id="reward-source" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Choose one</option>
            {REWARD_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-[13.5px] font-medium text-ink">Which feature would you like to try?</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {REWARD_FEATURES.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={feature === f.id} onClick={() => setFeature(f.id)}
                className={cn("rounded-lg border px-3 py-2 text-left text-[13px] transition", feature === f.id ? "border-accent bg-accent-soft font-semibold text-accent" : "border-border text-ink-2 hover:bg-surface-2")}>{f.label}</button>
            ))}
          </div>
        </fieldset>
        <p className="text-[12.5px] text-ink-3">You&apos;ll sign in with Google to claim it, because it&apos;s kept on your account.</p>
        {error && <p role="alert" className="text-[13.5px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
