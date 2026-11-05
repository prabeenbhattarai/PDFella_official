import type Stripe from "stripe";
import type { PaidPlan } from "./billing-plan";

/**
 * Changing plan. People keep what they've paid for: moving up starts straight away and
 * charges the difference, and moving down starts when the paid period ends.
 * No Next.js imports here, so tests/stripe can run this against Stripe's test mode.
 */
export type BillingPeriod = "monthly" | "yearly";
export interface PlanChoice { plan: PaidPlan; billing: BillingPeriod }
export type Timing = "none" | "now" | "period_end";
export type PriceLookup = (choice: PlanChoice) => string | undefined;

const RANK: Record<PaidPlan, number> = { lite: 0, pro: 1 };

export function changeTiming(from: PlanChoice, to: PlanChoice): Timing {
  if (to.plan !== from.plan) return RANK[to.plan] > RANK[from.plan] ? "now" : "period_end";
  if (to.billing === from.billing) return "none";
  return to.billing === "yearly" ? "now" : "period_end";
}

export function currentChoice(sub: Stripe.Subscription, prices: Record<string, PaidPlan>): PlanChoice | null {
  const price = sub.items.data[0]?.price;
  const plan = price && prices[price.id];
  if (!plan) return null;
  return { plan, billing: price.recurring?.interval === "year" ? "yearly" : "monthly" };
}

const scheduleId = (sub: Stripe.Subscription) => (typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id ?? null);

/** Forget a change that was waiting for the end of the period. */
export async function clearPendingChange(stripe: Stripe, sub: Stripe.Subscription) {
  const id = scheduleId(sub);
  if (id) await stripe.subscriptionSchedules.release(id);
}

/** What's waiting to happen at the end of the period, if anything. */
export async function pendingChange(stripe: Stripe, sub: Stripe.Subscription, prices: Record<string, PaidPlan>): Promise<(PlanChoice & { at: string }) | null> {
  const id = scheduleId(sub);
  if (!id) return null;
  const schedule = await stripe.subscriptionSchedules.retrieve(id, { expand: ["phases.items.price"] });
  const now = Date.now() / 1000;
  const next = schedule.phases.find((p) => p.start_date > now);
  const price = next?.items[0]?.price;
  if (!next || !price || typeof price === "string" || !("recurring" in price)) return null;
  const plan = prices[price.id];
  if (!plan) return null;
  return { plan, billing: price.recurring?.interval === "year" ? "yearly" : "monthly", at: new Date(next.start_date * 1000).toISOString() };
}

/** What moving up would charge today. */
export async function previewUpgrade(stripe: Stripe, sub: Stripe.Subscription, price: string) {
  const invoice = await stripe.invoices.createPreview({
    customer: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    subscription: sub.id,
    subscription_details: { items: [{ id: sub.items.data[0].id, price }], proration_behavior: "always_invoice" },
  });
  return { amount: invoice.amount_due, currency: invoice.currency };
}

/** Move up now. If the card is declined this throws and the plan stays as it was. */
export async function upgradeNow(stripe: Stripe, sub: Stripe.Subscription, price: string) {
  await clearPendingChange(stripe, sub);
  return stripe.subscriptions.update(sub.id, {
    items: [{ id: sub.items.data[0].id, price }],
    proration_behavior: "always_invoice",
    payment_behavior: "error_if_incomplete",
    cancel_at_period_end: false,
  });
}

/** Move down when the paid period ends. Until then nothing changes. */
export async function downgradeAtPeriodEnd(stripe: Stripe, sub: Stripe.Subscription, price: string, billing: BillingPeriod) {
  await clearPendingChange(stripe, sub);
  if (sub.cancel_at_period_end) await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
  const schedule = await stripe.subscriptionSchedules.create({ from_subscription: sub.id });
  const current = schedule.phases[0];
  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      {
        items: current.items.map((i) => ({ price: typeof i.price === "string" ? i.price : i.price.id, quantity: i.quantity ?? 1 })),
        start_date: current.start_date,
        end_date: current.end_date,
        metadata: sub.metadata,
      },
      { items: [{ price, quantity: 1 }], duration: { interval: billing === "yearly" ? "year" : "month", interval_count: 1 }, metadata: sub.metadata },
    ],
  });
  return stripe.subscriptions.retrieve(sub.id);
}

/** Cancel at the end of the paid period, or undo that. Cancelling drops any waiting change. */
export async function setCancelling(stripe: Stripe, sub: Stripe.Subscription, cancel: boolean) {
  if (cancel) await clearPendingChange(stripe, sub);
  return stripe.subscriptions.update(sub.id, { cancel_at_period_end: cancel });
}
