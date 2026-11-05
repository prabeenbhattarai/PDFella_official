import Stripe from "stripe";
import { json, fail, sameOrigin } from "@/lib/server/http";
import { bearer, verifyIdToken } from "@/lib/server/firebase-auth";
import { canSell, describeSubscription, liveSubscription, priceId, priceMap, stripe, syncSubscription } from "@/lib/server/billing";
import { canUndoCancel } from "@/lib/server/billing-plan";
import { changeTiming, clearPendingChange, currentChoice, downgradeAtPeriodEnd, pendingChange, previewUpgrade, setCancelling, upgradeNow } from "@/lib/server/billing-switch";

export const dynamic = "force-dynamic";

/** The signed-in account, or null. Everything here only ever touches that account's own subscription. */
async function accountId(req: Request): Promise<string | null> {
  const token = bearer(req);
  if (!token) return null;
  try { return (await verifyIdToken(token)).sub ?? null; } catch { return null; }
}

async function view(sub: Stripe.Subscription) {
  const fresh = await stripe().subscriptions.retrieve(sub.id);
  return { ...describeSubscription(fresh), billing: currentChoice(fresh, priceMap())?.billing ?? null, pending: await pendingChange(stripe(), fresh, priceMap()) };
}

/** The account's current subscription, read from Stripe so it's always up to date. */
export async function GET(req: Request) {
  if (!canSell()) return fail(503, "unavailable", "Payments aren't available yet.");
  const uid = await accountId(req);
  if (!uid) return fail(401, "unauthorized", "Sign in to see your subscription.");
  try {
    const sub = await liveSubscription(uid);
    return json({ subscription: sub ? await view(sub) : null });
  } catch (e) {
    console.error("[billing] read failed:", (e as Error).message);
    return fail(502, "upstream", "We couldn't load your subscription. Please try again.");
  }
}

/**
 * Changes to the account's own subscription:
 * `{ action: "cancel" | "resume" | "keep-plan" }`, or `{ action: "preview" | "switch", plan, billing }`.
 */
export async function POST(req: Request) {
  if (!canSell()) return fail(503, "unavailable", "Payments aren't available yet.");
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-origin request rejected");
  const uid = await accountId(req);
  if (!uid) return fail(401, "unauthorized", "Sign in to manage your subscription.");
  const body = await req.json().catch(() => null) as { action?: unknown; plan?: unknown; billing?: unknown } | null;
  const action = body?.action;
  try {
    const sub = await liveSubscription(uid);
    if (!sub) return fail(404, "no_subscription", "This account has no subscription to change.");

    if (action === "resume" && !canUndoCancel(sub as never)) return fail(410, "undo_expired", "The 24 hours to get your plan back have passed. You keep your plan until it ends, and you can buy a new one after that.");
    if (action === "cancel" && sub.cancel_at_period_end) return fail(409, "already_cancelled", "This subscription is already cancelled.");
    // Changing plan would quietly undo a cancellation, so that has to be undone first.
    if ((action === "switch" || action === "keep-plan") && sub.cancel_at_period_end) return fail(409, "cancelled", "Your subscription is cancelled, so its plan can't be changed. If you're within 24 hours of cancelling, get your plan back first.");

    if (action === "cancel" || action === "resume") await setCancelling(stripe(), sub, action === "cancel");
    else if (action === "keep-plan") await clearPendingChange(stripe(), sub);
    else if (action === "preview" || action === "switch") {
      const { plan, billing } = body ?? {};
      if ((plan !== "lite" && plan !== "pro") || (billing !== "monthly" && billing !== "yearly")) return fail(400, "bad_request", "Choose a plan.");
      const from = currentChoice(sub, priceMap());
      const price = priceId(plan, billing);
      if (!from || !price) return fail(400, "bad_request", "That plan isn't available.");
      const timing = changeTiming(from, { plan, billing });
      if (timing === "none") return fail(400, "same_plan", "You're already on this plan.");
      if (action === "preview") {
        return json({ timing, charge: timing === "now" ? await previewUpgrade(stripe(), sub, price) : null });
      }
      if (timing === "now") await upgradeNow(stripe(), sub, price);
      else await downgradeAtPeriodEnd(stripe(), sub, price, billing);
    } else return fail(400, "bad_request", "Unknown action.");

    await syncSubscription(sub.id, uid);
    return json({ subscription: await view(sub) });
  } catch (e) {
    if (e instanceof Stripe.errors.StripeCardError) return fail(402, "card_declined", "Your card was declined, so your plan hasn't changed. Update your card and try again.");
    console.error("[billing] change failed:", (e as Error).message);
    return fail(502, "upstream", "We couldn't update your subscription. Please try again.");
  }
}
