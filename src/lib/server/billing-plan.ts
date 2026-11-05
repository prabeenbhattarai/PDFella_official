/**
 * Which plan a Stripe subscription gives. No Stripe calls here, so the rules can be
 * tested on their own. Stripe keeps retrying a failed renewal (past_due), so the plan
 * stays on until Stripe gives up; a few spare days cover the gap around each renewal.
 */
import { UNDO_CANCEL_MINUTES } from "../plan-limits";

export type PaidPlan = "lite" | "pro";
export const RENEWAL_GRACE_DAYS = 3;
const KEEPS_PLAN = new Set(["active", "trialing", "past_due"]);
export const isLiveStatus = (status: string) => KEEPS_PLAN.has(status);

export interface SubscriptionLike {
  id?: string;
  status: string;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  current_period_end?: number;
  items: { data: { current_period_end?: number; price: { id: string; unit_amount?: number | null; currency?: string; recurring?: { interval?: string } | null } }[] };
}

/** What we keep on the account about a subscription, for the admin panel. */
export interface SubscriptionRecord { id: string; status: string; interval: string | null; cancelsAtEnd: boolean; periodEnd: string | null }

export function subscriptionRecord(sub: SubscriptionLike & { id: string }): SubscriptionRecord {
  const item = sub.items.data[0];
  const end = item?.current_period_end ?? sub.current_period_end;
  return { id: sub.id, status: sub.status, interval: item?.price.recurring?.interval ?? null, cancelsAtEnd: !!sub.cancel_at_period_end, periodEnd: end ? new Date(end * 1000).toISOString() : null };
}

export type PlanDecision =
  | { kind: "set"; plan: PaidPlan; until: string }
  | { kind: "remove" }
  /** A price we don't recognise: a setup mistake, which mustn't take away someone's plan. */
  | { kind: "unknown-price"; priceId: string };

export function planFromSubscription(sub: SubscriptionLike, prices: Record<string, PaidPlan>): PlanDecision {
  if (!KEEPS_PLAN.has(sub.status)) return { kind: "remove" };
  const item = sub.items.data[0];
  const plan = item && prices[item.price.id];
  if (!plan) return { kind: "unknown-price", priceId: item?.price.id ?? "none" };
  // Newer Stripe API versions keep the period on the item, and older ones on the subscription.
  const end = item.current_period_end ?? sub.current_period_end ?? 0;
  return { kind: "set", plan, until: new Date((end + RENEWAL_GRACE_DAYS * 86_400) * 1000).toISOString() };
}

/** What the account page shows. */
export interface SubscriptionView extends SubscriptionRecord {
  plan: PaidPlan | null; amount: number | null; currency: string | null;
  /** While cancelling: the last moment the cancellation can be undone. */
  undoUntil: string | null;
}

/** People can change their mind for a few minutes after cancelling, as long as the plan hasn't ended by then. */

export function undoDeadline(sub: Pick<SubscriptionLike, "cancel_at_period_end" | "canceled_at" | "current_period_end" | "items">): number | null {
  if (!sub.cancel_at_period_end || !sub.canceled_at) return null;
  const end = sub.items.data[0]?.current_period_end ?? sub.current_period_end;
  const deadline = sub.canceled_at + UNDO_CANCEL_MINUTES * 60;
  return end ? Math.min(deadline, end) : deadline;
}

export function canUndoCancel(sub: Parameters<typeof undoDeadline>[0], now = Date.now() / 1000) {
  const deadline = undoDeadline(sub);
  return deadline !== null && now < deadline;
}

export function subscriptionView(sub: SubscriptionLike & { id: string }, prices: Record<string, PaidPlan>): SubscriptionView {
  const price = sub.items.data[0]?.price;
  return { ...subscriptionRecord(sub), plan: price ? prices[price.id] ?? null : null, amount: price?.unit_amount ?? null, currency: price?.currency ?? null, undoUntil: (() => { const d = undoDeadline(sub); return d ? new Date(d * 1000).toISOString() : null; })() };
}
