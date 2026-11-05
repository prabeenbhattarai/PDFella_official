import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { canUndoCancel, planFromSubscription, undoDeadline, type PaidPlan } from "@/lib/server/billing-plan";
import { clearPendingChange, currentChoice, downgradeAtPeriodEnd, pendingChange, previewUpgrade, setCancelling, upgradeNow } from "@/lib/server/billing-switch";

/** Real Stripe test mode with a simulated clock, so renewals happen in seconds. Needs `npm run stripe:setup` first. */
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)?.slice(1) ?? []).filter((p) => p.length));
const key = env.STRIPE_SECRET_KEY as string;
if (!key?.startsWith("sk_test_")) throw new Error("These tests only run with a test key.");
const stripe = new Stripe(key);
const PRICE = { liteMonthly: env.STRIPE_PRICE_LITE_MONTHLY, liteYearly: env.STRIPE_PRICE_LITE_YEARLY, proMonthly: env.STRIPE_PRICE_PRO_MONTHLY, proYearly: env.STRIPE_PRICE_PRO_YEARLY } as Record<string, string>;
const prices: Record<string, PaidPlan> = { [PRICE.liteMonthly]: "lite", [PRICE.liteYearly]: "lite", [PRICE.proMonthly]: "pro", [PRICE.proYearly]: "pro" };
const DAY = 86_400;
const clocks: string[] = [];

async function setup(price: string, card = "pm_card_visa") {
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000) });
  clocks.push(clock.id);
  const customer = await stripe.customers.create({ test_clock: clock.id, email: "test@example.com", metadata: { uid: "test-uid" } });
  const pm = await stripe.paymentMethods.attach(card, { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
  const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price }], metadata: { uid: "test-uid" } });
  return { clock, customer, sub, start: clock.frozen_time };
}

async function advance(clockId: string, to: number) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: to });
  for (let i = 0; i < 90; i++) {
    const c = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (c.status === "ready") return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("The test clock didn't finish");
}

const get = (id: string) => stripe.subscriptions.retrieve(id);
const plan = (s: Stripe.Subscription) => planFromSubscription(s as never, prices);

afterAll(async () => {
  for (const id of clocks) await stripe.testHelpers.testClocks.del(id).catch(() => {});
});

describe("changing plan", () => {
  it("Lite to Pro starts now and charges only the difference", async () => {
    const { sub, customer } = await setup(PRICE.liteMonthly);
    const preview = await previewUpgrade(stripe, sub, PRICE.proMonthly);
    expect(preview.amount).toBeGreaterThan(0);
    expect(preview.amount).toBeLessThanOrEqual(600);

    const after = await upgradeNow(stripe, sub, PRICE.proMonthly);
    expect(currentChoice(after, prices)).toEqual({ plan: "pro", billing: "monthly" });
    expect(plan(after)).toMatchObject({ kind: "set", plan: "pro" });
    const latest = (await stripe.invoices.list({ customer: customer.id, limit: 1 })).data[0];
    expect(latest.status).toBe("paid");
    expect(latest.amount_paid).toBe(preview.amount);
  });

  it("Pro to Lite keeps Pro until the paid period ends, then renews as Lite", async () => {
    const { sub, clock, customer, start } = await setup(PRICE.proMonthly);
    const booked = await downgradeAtPeriodEnd(stripe, sub, PRICE.liteMonthly, "monthly");

    // Still Pro, with nothing charged.
    expect(currentChoice(booked, prices)).toEqual({ plan: "pro", billing: "monthly" });
    expect(await pendingChange(stripe, booked, prices)).toMatchObject({ plan: "lite", billing: "monthly" });
    expect((await stripe.invoices.list({ customer: customer.id })).data).toHaveLength(1);

    await advance(clock.id, start + 20 * DAY);
    expect(currentChoice(await get(sub.id), prices)?.plan).toBe("pro");

    await advance(clock.id, start + 33 * DAY);
    const renewed = await get(sub.id);
    expect(currentChoice(renewed, prices)).toEqual({ plan: "lite", billing: "monthly" });
    expect(renewed.status).toBe("active");
    expect(renewed.metadata.uid).toBe("test-uid");
    expect(plan(renewed)).toMatchObject({ kind: "set", plan: "lite" });
    const latest = (await stripe.invoices.list({ customer: customer.id, limit: 1 })).data[0];
    expect(latest.amount_paid).toBe(600);
  });

  it("a booked move down can be undone, and Pro then renews as Pro", async () => {
    const { sub, clock, customer, start } = await setup(PRICE.proMonthly);
    const booked = await downgradeAtPeriodEnd(stripe, sub, PRICE.liteMonthly, "monthly");
    await clearPendingChange(stripe, booked);
    const kept = await get(sub.id);
    expect(await pendingChange(stripe, kept, prices)).toBeNull();

    await advance(clock.id, start + 33 * DAY);
    expect(currentChoice(await get(sub.id), prices)?.plan).toBe("pro");
    expect((await stripe.invoices.list({ customer: customer.id, limit: 1 })).data[0].amount_paid).toBe(1200);
  });

  it("moving up while a move down is booked replaces it", async () => {
    const { sub } = await setup(PRICE.liteYearly);
    const booked = await downgradeAtPeriodEnd(stripe, sub, PRICE.liteMonthly, "monthly");
    const after = await upgradeNow(stripe, booked, PRICE.proYearly);
    expect(currentChoice(after, prices)).toEqual({ plan: "pro", billing: "yearly" });
    expect(await pendingChange(stripe, await get(sub.id), prices)).toBeNull();
  });

  it("a declined card leaves the plan as it was when moving up", async () => {
    const { sub, customer } = await setup(PRICE.liteMonthly);
    const bad = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: bad.id } });
    await expect(upgradeNow(stripe, sub, PRICE.proMonthly)).rejects.toBeInstanceOf(Stripe.errors.StripeCardError);
    expect(currentChoice(await get(sub.id), prices)).toEqual({ plan: "lite", billing: "monthly" });
  });
});

describe("cancelling", () => {
  it("keeps the plan until the paid period ends, then removes it, with no further charge", async () => {
    const { sub, clock, customer, start } = await setup(PRICE.liteMonthly);
    const cancelled = await setCancelling(stripe, sub, true);
    expect(cancelled.cancel_at_period_end).toBe(true);
    expect(plan(cancelled)).toMatchObject({ kind: "set", plan: "lite" });

    await advance(clock.id, start + 20 * DAY);
    expect(plan(await get(sub.id))).toMatchObject({ kind: "set", plan: "lite" });

    await advance(clock.id, start + 33 * DAY);
    const ended = await get(sub.id);
    expect(ended.status).toBe("canceled");
    expect(plan(ended)).toEqual({ kind: "remove" });
    expect((await stripe.invoices.list({ customer: customer.id })).data).toHaveLength(1);
  });

  it("can be undone before the period ends, and then renews", async () => {
    const { sub, clock, customer, start } = await setup(PRICE.liteMonthly);
    const cancelled = await setCancelling(stripe, sub, true);
    expect(cancelled.canceled_at).toBeTruthy();
    expect(canUndoCancel(cancelled as never, cancelled.canceled_at! + 3600)).toBe(true);
    expect(canUndoCancel(cancelled as never, cancelled.canceled_at! + 25 * 3600)).toBe(false);
    const undone = await setCancelling(stripe, cancelled, false);
    expect(undone.cancel_at_period_end).toBe(false);
    expect(undoDeadline(undone as never)).toBeNull();
    await advance(clock.id, start + 33 * DAY);
    expect((await get(sub.id)).status).toBe("active");
    expect((await stripe.invoices.list({ customer: customer.id })).data).toHaveLength(2);
  });

  it("cancelling drops a booked move down", async () => {
    const { sub, clock, start } = await setup(PRICE.proMonthly);
    const booked = await downgradeAtPeriodEnd(stripe, sub, PRICE.liteMonthly, "monthly");
    const cancelled = await setCancelling(stripe, booked, true);
    expect(await pendingChange(stripe, cancelled, prices)).toBeNull();
    expect(plan(cancelled)).toMatchObject({ kind: "set", plan: "pro" });
    await advance(clock.id, start + 33 * DAY);
    expect((await get(sub.id)).status).toBe("canceled");
  });
});

describe("failed renewals", () => {
  it("keep the plan while Stripe retries, and end it if the subscription is cancelled", async () => {
    const { sub, clock, customer, start } = await setup(PRICE.liteMonthly);
    const bad = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: bad.id } });

    await advance(clock.id, start + 32 * DAY);
    const failing = await get(sub.id);
    expect(failing.status).toBe("past_due");
    const decision = plan(failing);
    expect(decision).toMatchObject({ kind: "set", plan: "lite" });
    if (decision.kind === "set") expect(Date.parse(decision.until) / 1000).toBeGreaterThan(start + 32 * DAY);

    const ended = await stripe.subscriptions.cancel(sub.id);
    expect(plan(ended)).toEqual({ kind: "remove" });
  });
});
