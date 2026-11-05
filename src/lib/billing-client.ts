"use client";

import { authEnabled, requireAuth } from "./auth/store";
import { usePlan } from "./plans";
import { claimTier } from "./plan-claim";

/** Buttons fall back to emailing us until Stripe is set up. */
export const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === "1";

async function postWithToken(path: string, body?: unknown): Promise<string> {
  const { currentIdToken } = await import("./auth/firebase");
  const token = await currentIdToken();
  if (!token) throw new Error("Please sign in first.");
  const res = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) throw new Error(data?.message ?? "Something went wrong. Please try again.");
  return data.url;
}

/**
 * Buying always needs an account, because that's where the plan is kept. Signed-out
 * visitors sign in first and carry straight on; the server checks this again.
 */
export function startCheckout(plan: "lite" | "pro", billing: "yearly" | "monthly", onError: (message: string) => void): Promise<void> {
  const go = () => postWithToken("/api/billing/checkout", { plan, billing }).then((url) => { location.href = url; });
  if (!authEnabled) return Promise.reject(new Error("Sign-in isn't set up here, so plans can't be bought."));
  if (requireAuth("checkout", () => { go().catch((e: Error) => onError(e.message)); })) return go();
  return Promise.resolve();
}

export async function openBillingPortal() {
  location.href = await postWithToken("/api/billing/portal");
}

/** Stripe's message about a payment can arrive just after the customer returns, so keep checking briefly. */
export async function waitForPlan(attempts = 10, delayMs = 2000): Promise<boolean> {
  const { getFirebaseAuth } = await import("./auth/firebase");
  const auth = await getFirebaseAuth();
  await auth.authStateReady();
  for (let i = 0; i < attempts; i++) {
    const result = await auth.currentUser?.getIdTokenResult(true).catch(() => null);
    const tier = claimTier(result?.claims.plan);
    if (tier !== "free") {
      usePlan.getState().setTier(tier);
      return true;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}
