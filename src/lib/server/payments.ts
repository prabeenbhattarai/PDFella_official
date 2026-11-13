import "server-only";
import type Stripe from "stripe";
import { priceId, stripe, type Billing } from "./billing";
import type { PaidPlan } from "./billing-plan";
import { dash, KIND, live, planName, summarise, toRow, type InvoiceInfo, type PaymentRow, type PaymentsOverview } from "./payment-rows";

export type { PaymentRow, PaymentsOverview, PaymentStatus } from "./payment-rows";

/**
 * Read-only payment data for the admin panel, straight from Stripe. Nothing here
 * charges, refunds or changes anything: refunds and cancellations stay in Stripe.
 */

const MAX = 2000;

/** Which plan and billing each of our price IDs is. */
function priceLabels(): Record<string, { plan: PaidPlan; billing: Billing }> {
  const map: Record<string, { plan: PaidPlan; billing: Billing }> = {};
  for (const plan of ["lite", "pro"] as const) {
    for (const billing of ["monthly", "yearly"] as const) {
      const id = priceId(plan, billing);
      if (id) map[id] = { plan, billing };
    }
  }
  return map;
}

/** Invoices by payment intent, so each charge can say what it paid for. */
async function invoicesByPayment(params: Stripe.InvoiceListParams): Promise<Map<string, InvoiceInfo>> {
  const labels = priceLabels();
  const map = new Map<string, InvoiceInfo>();
  let n = 0;
  for await (const inv of stripe().invoices.list({ ...params, limit: 100, expand: ["data.payments"] })) {
    const price = inv.lines.data.map((l) => l.pricing?.price_details?.price).find(Boolean);
    const info: InvoiceInfo = {
      plan: planName(labels[typeof price === "string" ? price : price?.id ?? ""]),
      kind: KIND[inv.billing_reason ?? ""] ?? null,
      pdf: inv.invoice_pdf ?? null,
      email: inv.customer_email,
    };
    for (const p of inv.payments?.data ?? []) {
      const pi = p.payment.payment_intent;
      if (pi) map.set(typeof pi === "string" ? pi : pi.id, info);
    }
    if (++n >= MAX) break;
  }
  return map;
}

async function charges(params: Stripe.ChargeListParams): Promise<{ rows: Stripe.Charge[]; truncated: boolean }> {
  const rows: Stripe.Charge[] = [];
  for await (const c of stripe().charges.list({ ...params, limit: 100, expand: ["data.customer"] })) {
    rows.push(c);
    if (rows.length >= MAX) return { rows, truncated: true };
  }
  return { rows, truncated: false };
}

let cache: { at: number; data: PaymentsOverview } | null = null;

/** Revenue, subscriptions and recent payments. Cached for a minute, because each load asks Stripe. */
export async function paymentsOverview(): Promise<PaymentsOverview> {
  if (cache && Date.now() - cache.at < 60_000) return cache.data;
  const labels = priceLabels();
  const [{ rows, truncated }, invoices, subs] = await Promise.all([
    charges({}),
    invoicesByPayment({}),
    (async () => {
      const list: Stripe.Subscription[] = [];
      for await (const s of stripe().subscriptions.list({ status: "all", limit: 100, expand: ["data.customer", "data.latest_invoice"] })) {
        if (s.status === "active" || s.status === "trialing" || s.status === "past_due") list.push(s);
        if (list.length >= MAX) break;
      }
      return list;
    })(),
  ]);

  const totals = summarise(rows, subs, labels);
  const all = rows.map((c) => toRow(c, invoices));
  const data: PaymentsOverview = { live: live(), ...totals, recent: all.slice(0, 50), disputes: all.filter((r) => r.status === "disputed"), truncated };
  cache = { at: Date.now(), data };
  return data;
}

/** One customer's payments, newest first, and the card they last paid with. */
export async function customerPayments(customer: string): Promise<{ rows: PaymentRow[]; card: PaymentRow["card"]; stripeUrl: string }> {
  const [{ rows }, invoices] = await Promise.all([charges({ customer }), invoicesByPayment({ customer })]);
  const list = rows.map((c) => toRow(c, invoices));
  return { rows: list, card: list.find((r) => r.status !== "failed" && r.card)?.card ?? list[0]?.card ?? null, stripeUrl: dash(`customers/${customer}`) };
}
