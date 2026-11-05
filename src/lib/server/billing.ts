import "server-only";
import Stripe from "stripe";
import { accountAttributes, patchAccount } from "./admin";
import { isLiveStatus, planFromSubscription, subscriptionRecord, subscriptionView, type PaidPlan } from "./billing-plan";

/** Stripe subscriptions. See docs/BILLING.md for the setup. */
export type Billing = "yearly" | "monthly";

const PRICE_ENV: Record<PaidPlan, Record<Billing, string>> = {
  lite: { yearly: "STRIPE_PRICE_LITE_YEARLY", monthly: "STRIPE_PRICE_LITE_MONTHLY" },
  pro: { yearly: "STRIPE_PRICE_PRO_YEARLY", monthly: "STRIPE_PRICE_PRO_MONTHLY" },
};

export const priceId = (plan: PaidPlan, billing: Billing) => process.env[PRICE_ENV[plan][billing]];

/** Every price ID we sell, and the plan it gives. */
export function priceMap(): Record<string, PaidPlan> {
  const map: Record<string, PaidPlan> = {};
  for (const plan of ["lite", "pro"] as const) {
    for (const billing of ["yearly", "monthly"] as const) {
      const id = priceId(plan, billing);
      if (id) map[id] = plan;
    }
  }
  return map;
}

export const canSell = () => !!process.env.STRIPE_SECRET_KEY && Object.keys(priceMap()).length === 4;

let client: Stripe | null = null;
export function stripe(): Stripe {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

/**
 * Test and live Stripe customers are stored apart. Local testing uses the same Firebase
 * accounts as production, and a test customer ID would make live checkout fail for that account.
 */
const customerField = () => (process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "stripeCustomer" : "stripeCustomerTest");

/** The Stripe customer saved on this account, if they've ever bought a plan. */
export async function savedCustomer(uid: string): Promise<string | null> {
  const value = (await accountAttributes(uid))[customerField()];
  return typeof value === "string" ? value : null;
}

/**
 * The Stripe customer for this account, created and saved before any payment. So every
 * payment links back to one Firebase account and email, whatever happens during checkout.
 */
export async function ensureCustomer(account: { uid: string; email: string; name: string | null }): Promise<string> {
  const saved = await savedCustomer(account.uid);
  if (saved) return saved;
  const existing = (await stripe().customers.list({ email: account.email, limit: 10 })).data.find((c) => c.metadata.uid === account.uid);
  const customer = existing ?? await stripe().customers.create({ email: account.email, name: account.name ?? undefined, metadata: { uid: account.uid } });
  await patchAccount(account.uid, { [customerField()]: customer.id });
  return customer.id;
}

/** Note what someone started buying, on their account, before sending them to pay. */
export const recordCheckoutStarted = (uid: string, plan: PaidPlan, billing: Billing) =>
  patchAccount(uid, { stripeCheckout: { plan, billing, at: new Date().toISOString() } });

/** A Stripe page for this customer to update their card and see invoices. */
export const portalSession = (customer: string, returnUrl: string) =>
  stripe().billingPortal.sessions.create({ customer, return_url: returnUrl, ...(process.env.STRIPE_PORTAL_CONFIGURATION ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION } : {}) });

/**
 * The customer already paying for this account, if any. Stripe is asked directly, and
 * by email too, so a slow webhook or a first purchase in progress can't mean paying twice.
 */
export async function payingCustomer(uid: string, email: string | undefined): Promise<string | null> {
  const saved = await savedCustomer(uid);
  const byEmail = email ? (await stripe().customers.list({ email, limit: 5 })).data.map((c) => c.id) : [];
  for (const customer of new Set([...(saved ? [saved] : []), ...byEmail])) {
    const subs = await stripe().subscriptions.list({ customer, status: "all", limit: 20 });
    if (subs.data.some((s) => isLiveStatus(s.status) && (customer === saved || s.metadata.uid === uid))) return customer;
  }
  return null;
}

/** This account's current subscription, or null. Only ever looks at the customer saved on the account. */
export async function liveSubscription(uid: string): Promise<Stripe.Subscription | null> {
  const customer = await savedCustomer(uid);
  if (!customer) return null;
  const subs = await stripe().subscriptions.list({ customer, status: "all", limit: 20 });
  return subs.data.filter((s) => isLiveStatus(s.status)).sort((a, b) => b.created - a.created)[0] ?? null;
}

export const describeSubscription = (sub: Stripe.Subscription) => subscriptionView(sub as never, priceMap());

export class UnknownPriceError extends Error {}

/** Make the account match Stripe. Always re-reads the subscription, so events arriving out of order don't matter. */
export async function syncSubscription(subscriptionId: string, knownUid?: string | null) {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const uid = knownUid ?? sub.metadata.uid;
  if (!uid) throw new Error(`Subscription ${sub.id} has no account`);
  const decision = planFromSubscription(sub as never, priceMap());
  if (decision.kind === "unknown-price") throw new UnknownPriceError(`Subscription ${sub.id} uses an unknown price, ${decision.priceId}`);
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await patchAccount(uid, {
    plan: decision.kind === "set" ? { id: decision.plan, until: decision.until } : null,
    [customerField()]: customer,
    subscription: subscriptionRecord(sub as never),
    stripeCheckout: null,
  });
}
