"use client";

import { create } from "zustand";
import { requireAuth, useAuth, authEnabled, type LockedFeature } from "./auth/store";
import { DOCUMENTS_PER_DAY, LITE_TABS } from "./plan-limits";
import { claimTier, type Tier } from "./plan-claim";
import { activeReward, type RewardFeature } from "./reward";

/**
 * Free, Lite and Pro. Nothing is locked until NEXT_PUBLIC_PLANS_ENABLED=1, so the live site
 * doesn't change until people can actually buy Pro. Most of these locks run in the
 * browser, like the tools they guard; only cloud tasks are enforced on the server.
 */
export { activeReward, claimTier, type Tier };

const MODE = process.env.NEXT_PUBLIC_PLANS_ENABLED;
const PREVIEW_KEY = "pdfella.plan-preview";

/** Development and tests can act as a plan without an account or a payment. */
function preview(): Tier | null {
  if (process.env.NODE_ENV === "production" && MODE !== "test") return null;
  try {
    const v = localStorage.getItem(PREVIEW_KEY);
    return v === "free" || v === "lite" || v === "pro" ? v : null;
  } catch { return null; }
}

export const plansEnforced = () => MODE === "1" || (MODE === "test" && preview() !== null);

export type PlanFeature = "tabs" | "more-tabs" | "signature" | "stamp" | "fonts" | "pages" | "redact" | "forms" | "crop" | "bookmarks" | "templates" | "bulk-fill" | "documents";

/** The lowest plan that includes each feature. The daily document limit depends on the plan, so it isn't here. */
const NEEDS: Record<Exclude<PlanFeature, "documents">, Exclude<Tier, "free">> = {
  tabs: "lite", signature: "lite", stamp: "lite", fonts: "lite", pages: "lite", crop: "lite", bookmarks: "lite",
  "more-tabs": "pro", redact: "pro", forms: "pro", templates: "pro", "bulk-fill": "pro",
};
const RANK: Record<Tier, number> = { free: 0, lite: 1, pro: 2 };

/** What these asked for before plans existed, while they're switched off. */
const SIGN_IN_INSTEAD: Partial<Record<PlanFeature, LockedFeature>> = { signature: "signature", stamp: "stamp", pages: "pages", fonts: "fonts" };

/** The fonts most documents use (Arial, Times New Roman, Calibri and Courier look-alikes). */
export const FREE_FONTS = new Set(["Helvetica", "Times", "Courier", "arimo", "tinos", "cousine", "carlito"]);

interface PlanState {
  tier: Tier;
  /** False until the signed-in account's plan is known. */
  loaded: boolean;
  /** A paid feature unlocked by the welcome survey, for a day. */
  reward: { feature: RewardFeature; until: string } | null;
  upgrade: { feature: PlanFeature } | null;
  setTier(tier: Tier): void;
  setReward(reward: PlanState["reward"]): void;
  openUpgrade(feature: PlanFeature): void;
  closeUpgrade(): void;
}

export const usePlan = create<PlanState>((set) => ({
  tier: "free",
  loaded: false,
  reward: null,
  upgrade: null,
  setTier: (tier) => set({ tier, loaded: true }),
  setReward: (reward) => set({ reward }),
  openUpgrade: (feature) => set({ upgrade: { feature } }),
  closeUpgrade: () => set({ upgrade: null }),
}));

export const currentTier = (): Tier => preview() ?? usePlan.getState().tier;

/** The plan to offer someone who reached for this feature. */
export const planToOffer = (feature: PlanFeature): Exclude<Tier, "free"> =>
  feature === "documents" ? (currentTier() === "free" ? "lite" : "pro") : NEEDS[feature];

const rewardCovers = (reward: PlanState["reward"], feature: PlanFeature) =>
  !!reward && reward.feature === feature && Date.parse(reward.until) > Date.now();
const hasFeature = (tier: Tier, feature: Exclude<PlanFeature, "documents">, reward = usePlan.getState().reward) =>
  RANK[tier] >= RANK[NEEDS[feature]] || rewardCovers(reward, feature);

/** The plan to apply limits for, kept up to date as it loads. */
export function useTier(): Tier {
  const stored = usePlan((s) => s.tier);
  return preview() ?? stored;
}

/** For marking locked options. Nothing counts as locked while plans are switched off. */
export function useIsLocked() {
  const stored = usePlan((s) => s.tier);
  const reward = usePlan((s) => s.reward);
  const tier = preview() ?? stored;
  return (feature: Exclude<PlanFeature, "documents">) => plansEnforced() && !hasFeature(tier, feature, reward);
}

/**
 * Gate for paid features. Returns true when the visitor may go ahead; otherwise shows
 * the Premium dialog and returns false. While the account's plan is still loading,
 * it decides afterwards and runs `onUnlock` if their plan includes the feature.
 */
export function requirePlan(feature: Exclude<PlanFeature, "documents">, onUnlock?: () => void): boolean {
  if (!plansEnforced()) {
    const asked = SIGN_IN_INSTEAD[feature];
    return asked ? requireAuth(asked, onUnlock) : true;
  }
  if (hasFeature(currentTier(), feature)) return true;
  const settled = () => !authEnabled || (useAuth.getState().ready && (!useAuth.getState().user || usePlan.getState().loaded));
  if (settled()) {
    usePlan.getState().openUpgrade(feature);
    return false;
  }
  const check = () => {
    if (!settled()) return;
    stopAuth();
    stopPlan();
    if (hasFeature(currentTier(), feature)) onUnlock?.();
    else usePlan.getState().openUpgrade(feature);
  };
  const stopAuth = useAuth.subscribe(check);
  const stopPlan = usePlan.subscribe(check);
  return false;
}

/** Opening one more tab: free has one tab, Lite a few, and Pro as many as you like. */
export function requireTabSlot(open: number, onUnlock?: () => void): boolean {
  if (!requirePlan("tabs", onUnlock)) return false;
  return open < LITE_TABS || requirePlan("more-tabs", onUnlock);
}

/** Picking a font: original fonts from the PDF and the common ones stay free. */
export function requireFontChange(patch: { font?: string; bold?: boolean; italic?: boolean; underline?: boolean; fontFallback?: string }, onUnlock?: () => void): boolean {
  if (!plansEnforced()) return requireAuth("fonts", onUnlock);
  if (!patch.font || FREE_FONTS.has(patch.font) || patch.font.startsWith("orig:")) return true;
  return requirePlan("fonts", onUnlock);
}

// ───────── documents per day

const USAGE_KEY = "pdfella.documents";
const today = () => new Date().toISOString().slice(0, 10);

function opened(): string[] {
  try {
    const u = JSON.parse(localStorage.getItem(USAGE_KEY) ?? "null") as { day: string; docs: string[] } | null;
    return u?.day === today() ? u.docs : [];
  } catch { return []; }
}

/** Whether this visitor may open another document today (asks them to upgrade if not). */
export function requireDocumentAllowance(): boolean {
  if (!plansEnforced()) return true;
  if (opened().length < DOCUMENTS_PER_DAY[currentTier()]) return true;
  usePlan.getState().openUpgrade("documents");
  return false;
}

export function countDocument(key: string | null) {
  if (!key) return;
  const docs = opened();
  if (docs.includes(key)) return;
  try { localStorage.setItem(USAGE_KEY, JSON.stringify({ day: today(), docs: [...docs, key] })); } catch { /* storage blocked */ }
}
