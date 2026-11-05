import type Stripe from "stripe";
import { json, fail } from "@/lib/server/http";
import { stripe, syncSubscription } from "@/lib/server/billing";

export const dynamic = "force-dynamic";

/**
 * Stripe tells us about payments here, and this is the only thing that turns a paid
 * plan on, so nothing a browser sends can. The signature proves the message is from
 * Stripe. An error response makes Stripe retry later, so a failed update isn't lost.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) return fail(503, "unavailable", "Payments aren't available yet.");
  const signature = req.headers.get("stripe-signature");
  if (!signature) return fail(400, "bad_signature", "Missing signature");
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return fail(400, "bad_signature", "Invalid signature");
  }
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const id = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (id) await syncSubscription(id, session.client_reference_id);
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await syncSubscription(event.data.object.id);
    }
    return json({ received: true });
  } catch (e) {
    console.error("[billing] webhook failed:", event.type, (e as Error).message);
    return fail(500, "sync_failed", "Couldn't update the account");
  }
}
