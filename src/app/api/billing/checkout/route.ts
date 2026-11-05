import { json, fail, sameOrigin } from "@/lib/server/http";
import { config } from "@/lib/server/config";
import { bearer, verifyIdToken } from "@/lib/server/firebase-auth";
import { brand } from "@/lib/brand";
import { accountIdentity } from "@/lib/server/admin";
import { canSell, ensureCustomer, payingCustomer, priceId, recordCheckoutStarted, stripe, type Billing } from "@/lib/server/billing";

export const dynamic = "force-dynamic";

/** Start paying for a plan. Someone who already pays is sent to manage their subscription instead of paying twice. */
export async function POST(req: Request) {
  if (!canSell()) return fail(503, "unavailable", "Payments aren't available yet.");
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-origin request rejected");
  const token = bearer(req);
  if (!token) return fail(401, "unauthorized", "Sign in to buy a plan.");
  let uid: string;
  try { uid = (await verifyIdToken(token)).sub!; } catch { return fail(401, "unauthorized", "Sign in to buy a plan."); }

  const body = await req.json().catch(() => null) as { plan?: unknown; billing?: unknown } | null;
  const plan = body?.plan;
  const billing = body?.billing;
  if ((plan !== "lite" && plan !== "pro") || (billing !== "yearly" && billing !== "monthly")) return fail(400, "bad_request", "Choose a plan.");

  try {
    // The Firebase account is the record of who's buying, including for desktop app sign-ins.
    const account = await accountIdentity(uid);
    if (!account.email || !account.emailVerified) return fail(403, "email_needed", "Your account needs a verified email address to buy a plan.");
    if (account.disabled) return fail(403, "disabled", "This account is disabled.");

    // Already paying: changing plan happens on the existing subscription, on the account page.
    const paying = await payingCustomer(uid, account.email);
    if (paying) return json({ url: `${config.appUrl}/account` });

    // Saved before payment, so every payment links back to this account and email.
    const customer = await ensureCustomer({ uid, email: account.email, name: account.name });
    await recordCheckoutStarted(uid, plan, billing);
    const details = { uid, email: account.email, plan, billing };
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId(plan, billing as Billing)!, quantity: 1 }],
      client_reference_id: uid,
      customer,
      metadata: details,
      subscription_data: { metadata: details },
      allow_promotion_codes: true,
      // Said at the moment of paying, so a renewal is never a surprise.
      custom_text: { submit: { message: `Your plan renews automatically at this price until you cancel. You can cancel at any time from Manage subscription in your ${brand.name} account menu, and you keep your plan until the end of the period you've paid for.` } },
      ...(process.env.STRIPE_AUTOMATIC_TAX === "1" ? { automatic_tax: { enabled: true } } : {}),
      success_url: `${config.appUrl}/pricing?checkout=success`,
      cancel_url: `${config.appUrl}/pricing`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("[billing] checkout failed:", (e as Error).message);
    return fail(502, "upstream", "We couldn't start the checkout. Please try again.");
  }
}
