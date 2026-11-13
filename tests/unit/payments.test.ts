import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { statusOf, summarise, toRow, type InvoiceInfo } from "@/lib/server/payment-rows";

const now = new Date("2026-11-20T12:00:00Z");
const at = (iso: string) => Date.parse(iso) / 1000;
const charge = (o: Record<string, unknown>) => ({
  id: "ch_1", amount: 600, amount_refunded: 0, currency: "usd", status: "succeeded", refunded: false, disputed: false,
  created: at("2026-11-02T00:00:00Z"), payment_intent: "pi_1", customer: null, billing_details: { email: null, name: null },
  receipt_email: null, payment_method_details: { card: { brand: "visa", last4: "4242" } }, failure_message: null, ...o,
}) as unknown as Stripe.Charge;
const labels = { price_lite_m: { plan: "lite" as const, billing: "monthly" as const }, price_pro_y: { plan: "pro" as const, billing: "yearly" as const } };
const sub = (o: Record<string, unknown>) => ({ id: "sub_1", status: "active", cancel_at_period_end: false, customer: "cus_1", latest_invoice: null, items: { data: [{ quantity: 1, price: { id: "price_lite_m", unit_amount: 600, recurring: { interval: "month" } } }] }, ...o }) as unknown as Stripe.Subscription;

describe("payment status", () => {
  it("names each outcome", () => {
    expect(statusOf(charge({}))).toBe("paid");
    expect(statusOf(charge({ refunded: true, amount_refunded: 600 }))).toBe("refunded");
    expect(statusOf(charge({ amount_refunded: 200 }))).toBe("partially_refunded");
    expect(statusOf(charge({ status: "failed" }))).toBe("failed");
    expect(statusOf(charge({ status: "pending" }))).toBe("pending");
    expect(statusOf(charge({ disputed: true }))).toBe("disputed");
  });
});

describe("a payment row", () => {
  it("joins the charge with its invoice and customer, and shows only the card's last 4 digits", () => {
    const invoices = new Map<string, InvoiceInfo>([["pi_1", { plan: "Lite monthly", kind: "Renewal", pdf: "https://pay.stripe.com/inv.pdf", email: "inv@example.com" }]]);
    const row = toRow(charge({ customer: { id: "cus_1", email: "a@example.com", name: "Asha", metadata: { uid: "u1" } } }), invoices);
    expect(row).toMatchObject({ uid: "u1", email: "a@example.com", name: "Asha", plan: "Lite monthly", kind: "Renewal", invoicePdf: "https://pay.stripe.com/inv.pdf", card: { brand: "visa", last4: "4242" }, status: "paid" });
    expect(JSON.stringify(row)).not.toMatch(/"(number|exp_month|exp_year|fingerprint)"/);
  });
  it("falls back to the invoice or receipt email, and explains failures", () => {
    expect(toRow(charge({ receipt_email: "r@example.com" }), new Map()).email).toBe("r@example.com");
    const failed = toRow(charge({ status: "failed", failure_message: "Your card was declined." }), new Map());
    expect(failed.failure).toBe("Your card was declined.");
  });
});

describe("totals", () => {
  const charges = [
    charge({ id: "a", amount: 600, created: at("2026-11-02T00:00:00Z") }),
    charge({ id: "b", amount: 1200, amount_refunded: 1200, refunded: true, created: at("2026-11-03T00:00:00Z") }),
    charge({ id: "c", amount: 9600, created: at("2026-10-15T00:00:00Z") }),
    charge({ id: "d", amount: 600, status: "failed", created: at("2026-11-04T00:00:00Z") }),
  ];
  it("counts revenue after refunds, by calendar month, and ignores failed payments", () => {
    const t = summarise(charges, [], labels, now);
    expect(t.revenue).toEqual({ month: 600, lastMonth: 9600, allTime: 10200, refunds: 1200, payments: 3 });
  });
  it("counts live subscriptions by plan and billing, with yearly prices spread over 12 months", () => {
    const t = summarise([], [
      sub({}),
      sub({ id: "sub_2", cancel_at_period_end: true, items: { data: [{ quantity: 1, price: { id: "price_pro_y", unit_amount: 9600, recurring: { interval: "year" } } }] } }),
      sub({ id: "sub_3", status: "past_due", customer: { email: "late@example.com", metadata: { uid: "u3" } } }),
      sub({ id: "sub_4", status: "canceled" }),
    ], labels, now);
    expect(t.subscriptions).toEqual({ active: 3, lite: 2, pro: 1, monthly: 2, yearly: 1, mrr: 600 + 800 + 600, cancelling: 1 });
    expect(t.pastDue).toHaveLength(1);
    expect(t.pastDue[0]).toMatchObject({ email: "late@example.com", uid: "u3", plan: "Lite monthly" });
  });
});
