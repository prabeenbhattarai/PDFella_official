import type Stripe from "stripe";
import type { PaidPlan } from "./billing-plan";

/**
 * Turning Stripe objects into what the admin panel shows. No Stripe calls here, so it
 * can be tested on its own (see payments.ts for the reads).
 */

export type PaymentStatus = "paid" | "refunded" | "partially_refunded" | "failed" | "disputed" | "pending";

export interface PaymentRow {
  id: string;
  created: string;
  uid: string | null;
  email: string | null;
  name: string | null;
  /** In the smallest unit (cents). */
  amount: number;
  refunded: number;
  currency: string;
  status: PaymentStatus;
  /** "Lite monthly", if the payment was for a plan we sell. */
  plan: string | null;
  /** New subscription, renewal or plan change. */
  kind: string | null;
  card: { brand: string; last4: string } | null;
  failure: string | null;
  invoicePdf: string | null;
  stripeUrl: string;
}

export interface PaymentsOverview {
  live: boolean;
  currency: string;
  /** After refunds, in cents. "Month" is the calendar month in UTC. */
  revenue: { month: number; lastMonth: number; allTime: number; refunds: number; payments: number };
  subscriptions: { active: number; lite: number; pro: number; monthly: number; yearly: number; mrr: number; cancelling: number };
  recent: PaymentRow[];
  pastDue: { email: string | null; uid: string | null; plan: string | null; since: string | null; stripeUrl: string }[];
  disputes: PaymentRow[];
  /** Set when there were more payments than we read. */
  truncated: boolean;
}

export const live = () => !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_");
export const dash = (path: string) => `https://dashboard.stripe.com/${live() ? "" : "test/"}${path}`;
export const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);
export const planName = (p: { plan: PaidPlan; billing: "monthly" | "yearly" } | undefined) => (p ? `${p.plan === "lite" ? "Lite" : "Pro"} ${p.billing}` : null);

export const KIND: Partial<Record<string, string>> = {
  subscription_create: "New subscription",
  subscription_cycle: "Renewal",
  subscription_update: "Plan change",
  manual: "One-off",
};

export interface InvoiceInfo { plan: string | null; kind: string | null; pdf: string | null; email: string | null }

export function statusOf(c: Stripe.Charge): PaymentStatus {
  if (c.disputed) return "disputed";
  if (c.status === "failed") return "failed";
  if (c.status === "pending") return "pending";
  if (c.refunded) return "refunded";
  if (c.amount_refunded > 0) return "partially_refunded";
  return "paid";
}

export function toRow(c: Stripe.Charge, invoices: Map<string, InvoiceInfo>): PaymentRow {
  const customer = c.customer && typeof c.customer !== "string" && !("deleted" in c.customer && c.customer.deleted) ? (c.customer as Stripe.Customer) : null;
  const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id ?? null;
  const inv = pi ? invoices.get(pi) : undefined;
  const card = c.payment_method_details?.card;
  return {
    id: c.id,
    created: new Date(c.created * 1000).toISOString(),
    uid: customer?.metadata?.uid ?? null,
    email: customer?.email ?? inv?.email ?? c.billing_details?.email ?? c.receipt_email ?? null,
    name: customer?.name ?? c.billing_details?.name ?? null,
    amount: c.amount,
    refunded: c.amount_refunded,
    currency: c.currency,
    status: statusOf(c),
    plan: inv?.plan ?? null,
    kind: inv?.kind ?? null,
    card: card?.last4 ? { brand: card.brand ?? "card", last4: card.last4 } : null,
    failure: c.status === "failed" ? c.failure_message ?? "The payment failed." : null,
    invoicePdf: inv?.pdf ?? null,
    stripeUrl: dash(`payments/${pi ?? c.id}`),
  };
}

const net = (c: Stripe.Charge) => (c.status === "succeeded" ? c.amount - c.amount_refunded : 0);

/** Revenue and subscription totals from charges and live subscriptions. */
export function summarise(charges: Stripe.Charge[], subs: Stripe.Subscription[], labels: Record<string, { plan: PaidPlan; billing: "monthly" | "yearly" }>, now = new Date()) {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000;
  const lastMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1) / 1000;
  const succeeded = charges.filter((c) => c.status === "succeeded");
  const subscriptions = { active: 0, lite: 0, pro: 0, monthly: 0, yearly: 0, mrr: 0, cancelling: 0 };
  const pastDue: PaymentsOverview["pastDue"] = [];
  for (const s of subs) {
    if (s.status !== "active" && s.status !== "trialing" && s.status !== "past_due") continue;
    const item = s.items.data[0];
    const label = labels[item?.price.id ?? ""];
    const customer = typeof s.customer === "string" ? null : (s.customer as Stripe.Customer);
    if (s.status === "past_due") {
      pastDue.push({ email: customer?.email ?? null, uid: customer?.metadata?.uid ?? null, plan: planName(label), since: iso(s.latest_invoice && typeof s.latest_invoice !== "string" ? s.latest_invoice.created : null), stripeUrl: dash(`subscriptions/${s.id}`) });
    }
    subscriptions.active += 1;
    if (label) { subscriptions[label.plan] += 1; subscriptions[label.billing] += 1; }
    if (s.cancel_at_period_end) subscriptions.cancelling += 1;
    const amount = (item?.price.unit_amount ?? 0) * (item?.quantity ?? 1);
    const interval = item?.price.recurring?.interval;
    subscriptions.mrr += interval === "year" ? amount / 12 : interval === "month" ? amount : 0;
  }
  subscriptions.mrr = Math.round(subscriptions.mrr);
  return {
    currency: succeeded[0]?.currency ?? "usd",
    revenue: {
      month: succeeded.filter((c) => c.created >= monthStart).reduce((n, c) => n + net(c), 0),
      lastMonth: succeeded.filter((c) => c.created >= lastMonthStart && c.created < monthStart).reduce((n, c) => n + net(c), 0),
      allTime: succeeded.reduce((n, c) => n + net(c), 0),
      refunds: charges.reduce((n, c) => n + c.amount_refunded, 0),
      payments: succeeded.length,
    },
    subscriptions,
    pastDue,
  };
}
