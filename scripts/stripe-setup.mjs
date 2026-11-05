/**
 * Creates PDFella's Lite and Pro plans in Stripe, using the prices in src/lib/pricing.ts,
 * and saves the IDs to .env.local. It's safe to run again: anything that exists is reused.
 *
 *   npm run stripe:setup             test mode (needs a sk_test_ key)
 *   npm run stripe:setup -- --live   live mode (needs STRIPE_LIVE_SECRET_KEY in .env.local)
 *
 * Live mode prints the IDs for Vercel and leaves your test settings alone. It never
 * prints a secret key. Remove STRIPE_LIVE_SECRET_KEY from .env.local afterwards.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENV_FILE = path.join(ROOT, ".env.local");
const SITE = "https://www.pdfella.com";
const live = process.argv.includes("--live");

function stop(message) {
  console.error(message);
  process.exit(1);
}

const envText = readFileSync(ENV_FILE, "utf8");
const keyName = live ? "STRIPE_LIVE_SECRET_KEY" : "STRIPE_SECRET_KEY";
const key = envText.match(new RegExp(`^${keyName}=(.+)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!key) stop(`Add ${keyName} to .env.local first (Stripe dashboard: Developers, API keys).`);
if (!key.startsWith(live ? "sk_live_" : "sk_test_")) stop(`${keyName} should start with ${live ? "sk_live_" : "sk_test_"}. Local testing only ever uses a test key.`);

// One source for prices, so Stripe and the pricing page can't disagree.
const source = readFileSync(path.join(ROOT, "src/lib/pricing.ts"), "utf8");
const dollars = (plan) => {
  const m = source.match(new RegExp(`${plan}: \\{ yearly: (\\d+), monthly: (\\d+) \\}`));
  if (!m) stop(`Couldn't read the ${plan} price from src/lib/pricing.ts`);
  return { yearly: Number(m[1]), monthly: Number(m[2]) };
};

const PLANS = [
  { id: "lite", name: "PDFella Lite", description: "Signatures, stamps, extra fonts, up to 3 tabs and 20 documents a day." },
  { id: "pro", name: "PDFella Pro", description: "Every feature, with no document or tab limits." },
];

const stripe = new Stripe(key);
const env = {};

async function findProduct(plan) {
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    if (p.metadata.pdfella_plan === plan.id) return p;
  }
  return null;
}

async function ensurePrice(product, plan, billing, usd) {
  const lookup_key = `pdfella_${plan.id}_${billing}`;
  const amount = (billing === "yearly" ? usd * 12 : usd) * 100;
  const interval = billing === "yearly" ? "year" : "month";
  const existing = (await stripe.prices.list({ lookup_keys: [lookup_key], active: true, limit: 1 })).data[0];
  if (existing?.unit_amount === amount && existing.currency === "usd") return existing;
  // Stripe prices can't be edited, so a new amount means a new price taking over the lookup key.
  return stripe.prices.create({ product: product.id, currency: "usd", unit_amount: amount, recurring: { interval }, lookup_key, transfer_lookup_key: true });
}

try {
    for (const plan of PLANS) {
    const usd = dollars(plan.id);
    const product = await findProduct(plan)
      ?? await stripe.products.create({ name: plan.name, description: plan.description, metadata: { pdfella_plan: plan.id } });
    for (const billing of ["monthly", "yearly"]) {
      const price = await ensurePrice(product, plan, billing, usd[billing]);
      env[`STRIPE_PRICE_${plan.id.toUpperCase()}_${billing.toUpperCase()}`] = price.id;
      console.log(`${plan.name}, ${billing}: $${price.unit_amount / 100}`);
    }
  }

  // The page where customers update their card and see invoices.
  const portal = {
    business_profile: { privacy_policy_url: `${SITE}/privacy`, terms_of_service_url: `${SITE}/terms` },
    features: {
      customer_update: { enabled: true, allowed_updates: ["address", "tax_id"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      // Cancelling and changing plan happen on /account, so they follow one set of rules.
      subscription_cancel: { enabled: false },
      subscription_update: { enabled: false },
    },
    metadata: { pdfella: "1" },
  };
  const configurations = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const current = configurations.data.find((c) => c.metadata?.pdfella === "1");
  const saved = current ? await stripe.billingPortal.configurations.update(current.id, portal) : await stripe.billingPortal.configurations.create(portal);
  env.STRIPE_PORTAL_CONFIGURATION = saved.id;
  console.log("Customer portal: ready");
} catch (e) {
  stop(`Stripe said: ${e.message}`);
}

env.NEXT_PUBLIC_BILLING_ENABLED = "1";

if (live) {
  console.log("\nAdd these to Vercel, along with your live secret key and webhook secret:");
  for (const [name, value] of Object.entries(env)) console.log(`${name}=${value}`);
  console.log("\nNow remove STRIPE_LIVE_SECRET_KEY from .env.local.");
} else {
  let next = envText;
  for (const [name, value] of Object.entries(env)) {
    const line = `${name}=${value}`;
    const pattern = new RegExp(`^${name}=.*$`, "m");
    next = pattern.test(next) ? next.replace(pattern, line) : `${next.replace(/\n?$/, "\n")}${line}\n`;
  }
  writeFileSync(ENV_FILE, next);
  console.log("\nSaved to .env.local.");
}
