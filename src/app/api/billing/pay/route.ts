import type Stripe from "stripe";
import { json, fail, sameOrigin } from "@/lib/server/http";
import { bearer, verifyIdToken } from "@/lib/server/firebase-auth";
import { canSell, liveSubscription, stripe, syncSubscription } from "@/lib/server/billing";
import { isPausedStatus } from "@/lib/server/billing-plan";

export const dynamic = "force-dynamic";

/**
 * A paused subscription: send the account's owner to Stripe's page for the unpaid
 * invoice. Once it's paid, Stripe tells the webhook and the plan comes back.
 */
export async function POST(req: Request) {
  if (!canSell()) return fail(503, "unavailable", "Payments aren't available yet.");
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-origin request rejected");
  const token = bearer(req);
  let uid: string | undefined;
  try { uid = token ? (await verifyIdToken(token)).sub : undefined; } catch { uid = undefined; }
  if (!uid) return fail(401, "unauthorized", "Sign in to pay.");
  try {
    const sub = await liveSubscription(uid);
    if (!sub || !isPausedStatus(sub.status)) return fail(409, "nothing_due", "There's nothing to pay. Your subscription is up to date.");
    const full = await stripe().subscriptions.retrieve(sub.id, { expand: ["latest_invoice"] });
    const invoice = full.latest_invoice as Stripe.Invoice | null;
    if (!invoice || invoice.status !== "open" || !invoice.hosted_invoice_url) {
      // Paid in the meantime: bring the account up to date.
      await syncSubscription(sub.id, uid).catch(() => {});
      return fail(409, "nothing_due", "There's nothing to pay. Refresh the page to see your plan.");
    }
    return json({ url: invoice.hosted_invoice_url });
  } catch (e) {
    console.error("[billing] pay failed:", (e as Error).message);
    return fail(502, "upstream", "We couldn't open the payment page. Please try again.");
  }
}
