import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";

// Matches STRIPE_WEBHOOK_SECRET in playwright.config.ts, and isn't a real secret.
const sign = (payload: string, secret = "whsec_test_only", at = Math.floor(Date.now() / 1000)) =>
  `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${payload}`).digest("hex")}`;
const event = JSON.stringify({ id: "evt_test", object: "event", type: "invoice.created", data: { object: {} } });
const post = (request: import("@playwright/test").APIRequestContext, signature?: string) =>
  request.post("/api/billing/webhook", { data: event, headers: { "Content-Type": "application/json", ...(signature ? { "Stripe-Signature": signature } : {}) } });

test("the webhook only accepts messages signed by Stripe", async ({ request }) => {
  expect((await post(request)).status()).toBe(400);
  expect((await post(request, sign(event, "whsec_wrong"))).status()).toBe(400);
  expect((await post(request, sign(`${event} `))).status()).toBe(400);
  expect((await post(request, sign(event, "whsec_test_only", 1_000_000))).status()).toBe(400);
  expect((await post(request, sign(event))).status()).toBe(200);
});

test("nobody can buy or manage a plan without being signed in", async ({ request }) => {
  const buy = { plan: "pro", billing: "yearly" };
  expect((await request.post("/api/billing/checkout", { data: buy })).status()).toBe(401);
  expect((await request.post("/api/billing/checkout", { data: buy, headers: { Authorization: "Bearer not-a-real-token" } })).status()).toBe(401);
  expect((await request.get("/api/billing/subscription")).status()).toBe(401);
  expect((await request.post("/api/billing/subscription", { data: { action: "cancel" } })).status()).toBe(401);
  expect((await request.post("/api/billing/subscription", { data: { action: "switch", plan: "pro", billing: "yearly" }, headers: { Authorization: "Bearer not-a-real-token" } })).status()).toBe(401);
  expect((await request.post("/api/billing/portal")).status()).toBe(401);
  expect((await request.post("/api/billing/portal", { headers: { Authorization: "Bearer not-a-real-token" } })).status()).toBe(401);
});

test("until then, buy buttons offer an email", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("link", { name: "Get Pro" })).toHaveAttribute("href", /^mailto:/);
});

test("the account page stays hidden until payments are on", async ({ request }) => {
  expect((await request.get("/account")).status()).toBe(404);
});
