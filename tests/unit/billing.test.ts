import { describe, expect, it } from "vitest";
import { canUndoCancel, isLiveStatus, planFromSubscription, subscriptionRecord, subscriptionView, undoDeadline } from "@/lib/server/billing-plan";

const prices = { price_lite: "lite", price_pro: "pro" } as const;
const sub = (status: string, price = "price_pro", period: { item?: number; top?: number } = { item: 1_800_000_000 }) => ({
  status,
  current_period_end: period.top,
  items: { data: [{ price: { id: price }, current_period_end: period.item }] },
});
const threeDaysAfter = (s: number) => new Date((s + 3 * 86_400) * 1000).toISOString();

describe("which plan a subscription gives", () => {
  it("gives the plan of its price, until just after the period ends", () => {
    expect(planFromSubscription(sub("active"), prices)).toEqual({ kind: "set", plan: "pro", until: threeDaysAfter(1_800_000_000) });
    expect(planFromSubscription(sub("active", "price_lite"), prices)).toMatchObject({ kind: "set", plan: "lite" });
  });
  it("reads the period from older Stripe API versions too", () => {
    expect(planFromSubscription(sub("active", "price_pro", { top: 1_700_000_000 }), prices)).toEqual({ kind: "set", plan: "pro", until: threeDaysAfter(1_700_000_000) });
  });
  it("keeps the plan while Stripe retries a failed payment", () => {
    expect(planFromSubscription(sub("past_due"), prices).kind).toBe("set");
  });
  it.each(["canceled", "unpaid", "incomplete_expired", "paused"])("removes the plan when %s", (status) => {
    expect(planFromSubscription(sub(status), prices)).toEqual({ kind: "remove" });
  });
  it("never removes a plan because of an unknown price", () => {
    expect(planFromSubscription(sub("active", "price_other"), prices)).toEqual({ kind: "unknown-price", priceId: "price_other" });
  });
});

describe("what counts as already paying", () => {
  it.each(["active", "trialing", "past_due"])("%s does, so nobody subscribes twice", (s) => expect(isLiveStatus(s)).toBe(true));
  it.each(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"])("%s doesn't", (s) => expect(isLiveStatus(s)).toBe(false));
});

describe("the record kept on the account", () => {
  it("notes the subscription, how it's billed and when the period ends", () => {
    const record = subscriptionRecord({ id: "sub_1", status: "active", cancel_at_period_end: true, items: { data: [{ current_period_end: 1_800_000_000, price: { id: "p", recurring: { interval: "year" } } }] } });
    expect(record).toEqual({ id: "sub_1", status: "active", interval: "year", cancelsAtEnd: true, periodEnd: new Date(1_800_000_000_000).toISOString() });
  });
  it("copes with missing details", () => {
    expect(subscriptionRecord({ id: "sub_2", status: "canceled", items: { data: [] } })).toEqual({ id: "sub_2", status: "canceled", interval: null, cancelsAtEnd: false, periodEnd: null });
  });
});

describe("what the account page shows", () => {
  it("names the plan and price, and whether it's cancelling", () => {
    const view = subscriptionView({ id: "sub_1", status: "active", cancel_at_period_end: true, items: { data: [{ current_period_end: 1_800_000_000, price: { id: "price_lite", unit_amount: 4800, currency: "usd", recurring: { interval: "year" } } }] } }, prices);
    expect(view).toMatchObject({ plan: "lite", amount: 4800, currency: "usd", interval: "year", cancelsAtEnd: true });
  });
  it("doesn't guess the plan from an unknown price", () => {
    expect(subscriptionView({ id: "sub_2", status: "active", items: { data: [{ price: { id: "price_other" } }] } }, prices).plan).toBeNull();
  });
});

describe("getting a plan back after cancelling", () => {
  const MIN = 60;
  const cancelled = (canceledAt: number, periodEnd = canceledAt + 30 * 86_400) => ({ cancel_at_period_end: true, canceled_at: canceledAt, items: { data: [{ current_period_end: periodEnd, price: { id: "p" } }] } });
  it("is allowed for 5 minutes, and not after", () => {
    expect(canUndoCancel(cancelled(1000), 1000 + 4 * MIN)).toBe(true);
    expect(canUndoCancel(cancelled(1000), 1000 + 5 * MIN)).toBe(false);
    expect(canUndoCancel(cancelled(1000), 1000 + 6 * MIN)).toBe(false);
  });
  it("can't run past the end of the plan", () => {
    expect(undoDeadline(cancelled(1000, 1000 + 2 * MIN))).toBe(1000 + 2 * MIN);
    expect(canUndoCancel(cancelled(1000, 1000 + 2 * MIN), 1000 + 3 * MIN)).toBe(false);
  });
  it("doesn't apply to a subscription that isn't cancelling", () => {
    expect(undoDeadline({ cancel_at_period_end: false, canceled_at: 1000, items: { data: [] } })).toBeNull();
    expect(canUndoCancel({ cancel_at_period_end: false, items: { data: [] } })).toBe(false);
  });
});
