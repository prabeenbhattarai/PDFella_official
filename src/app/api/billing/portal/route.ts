import { json, fail, sameOrigin } from "@/lib/server/http";
import { config } from "@/lib/server/config";
import { bearer, verifyIdToken } from "@/lib/server/firebase-auth";
import { canSell, portalSession, savedCustomer } from "@/lib/server/billing";

export const dynamic = "force-dynamic";

/** Stripe's own page for changing plan, updating a card, cancelling and seeing invoices. */
export async function POST(req: Request) {
  if (!canSell()) return fail(503, "unavailable", "Payments aren't available yet.");
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-origin request rejected");
  const token = bearer(req);
  if (!token) return fail(401, "unauthorized", "Sign in to manage your subscription.");
  let uid: string;
  try { uid = (await verifyIdToken(token)).sub!; } catch { return fail(401, "unauthorized", "Sign in to manage your subscription."); }
  try {
    const customer = await savedCustomer(uid);
    if (!customer) return fail(404, "no_subscription", "This account has no subscription to manage.");
    const portal = await portalSession(customer, `${config.appUrl}/pricing`);
    return json({ url: portal.url });
  } catch (e) {
    console.error("[billing] portal failed:", (e as Error).message);
    return fail(502, "upstream", "We couldn't open your subscription. Please try again.");
  }
}
