# Payments with Stripe

Stripe's messages to `/api/billing/webhook` are the only thing that turns a paid plan
on. It's stored on the Firebase account and reaches the browser in the sign-in token.

Buying always needs a Firebase (Google) login. Before payment, the account gets a Stripe
customer and a note of what they started buying, and the customer and subscription carry
the account's ID and email. The admin panel shows this record for each email.

Do all of this in **test mode** first, then repeat it in live mode.

## Set up

1. **Account:** create one at stripe.com. Check your country at
   https://stripe.com/global first. Stripe asks for your business details, and for a
   site showing your prices, terms, refund policy and contact details.
2. **Products and customer portal:** put the secret key in `.env.local` as
   `STRIPE_SECRET_KEY`, then run `npm run stripe:setup`. It creates Lite and Pro with
   the prices in `src/lib/pricing.ts`, sets up the customer portal, and saves the IDs
   to `.env.local`. It's safe to run again. For live mode, add `STRIPE_LIVE_SECRET_KEY` to `.env.local`, run `npm run stripe:setup -- --live`, copy the printed IDs to Vercel, then remove that key from `.env.local`.
3. **Webhook** (Developers, Webhooks): add `https://www.pdfella.com/api/billing/webhook`
   with these events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. **Vercel environment variables**, then redeploy. Never paste the secret values into chat:

   ```
   NEXT_PUBLIC_BILLING_ENABLED=1
   STRIPE_SECRET_KEY=
   STRIPE_WEBHOOK_SECRET=
   STRIPE_PRICE_LITE_YEARLY=
   STRIPE_PRICE_LITE_MONTHLY=
   STRIPE_PRICE_PRO_YEARLY=
   STRIPE_PRICE_PRO_MONTHLY=
   STRIPE_PORTAL_CONFIGURATION=
   ```

   `FIREBASE_SERVICE_ACCOUNT` must already be set.
5. **Turn on the plans** with `NEXT_PUBLIC_PLANS_ENABLED=1`, only once a test purchase works.

## How people manage their own plan

`/account` (*Manage subscription* in the account menu) shows the plan, price and next payment.

- **Moving up** (Lite to Pro, or monthly to yearly) starts straight away and charges the difference. If the card is declined, the plan stays as it was.
- **Moving down** (Pro to Lite, or yearly to monthly) starts when the paid period ends. They keep what they paid for until then, and can change their mind.
- **Cancelling** stops at the end of the paid period. It can be undone for 24 hours, with a countdown on the page and the limit enforced on the server. After that they keep the plan until it ends, then can buy a new one. Plans can't be switched while cancelled.
- **Failed renewals:** Stripe retries the card and the plan stays on while it does. When the retries run out, Stripe cancels the subscription and the plan is removed.
- **Card and invoices** open Stripe's customer portal, which only handles those.

`npm run test:stripe` runs all of this against Stripe's test mode with a simulated clock.

## Settings that prevent disputes

Do these in the Stripe dashboard before taking real payments:

- **Statement descriptor** (Settings, Public details): use `PDFELLA`. An unrecognised name on a bank statement is a common reason for disputes.
- **Support details** (Settings, Public details): add your support email and website.
- **Customer emails** (Settings, Customer emails, and Billing, Subscriptions and emails): turn on receipts, refunds, upcoming renewal reminders and failed payment emails.
- **Failed payments** (Billing, Revenue recovery, Retries): use Smart Retries, the recommended 8 tries over 2 weeks, and set the subscription to **cancel** when they run out. The plan is then removed automatically.

## Handling refunds and disputes

- **Refund (only where required, or if you choose to):** refund the payment in Stripe **and** cancel the subscription immediately. A refund alone doesn't stop future charges or remove the plan.
- **Account deletion request:** cancel their subscription first, or they'll keep being charged.
- **Paying customers:** change plans in Stripe, not the admin panel. The admin panel refuses, because it would stop matching what they're charged.
- **Keep prices in step:** after changing `src/lib/pricing.ts`, run `npm run stripe:setup`. Existing customers stay on their old price unless you move them.

## Test purchases and real accounts

Local testing signs in to the same Firebase accounts as production. Test only with your
own account. A test purchase puts a plan on it, so remove that from the admin panel when
you finish. Test customer IDs are stored separately, so they can't break live checkout.

## Test a purchase

With test keys, buy a plan using Stripe's test card `4242 4242 4242 4242`, any future
date and any CVC. Then check that:

- the plan unlocks when you return to the site
- the admin panel shows the plan on your account
- *Manage subscription* opens, and cancelling removes the plan at the end of the period

To test locally, use the Stripe CLI to forward events:
`stripe listen --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted --forward-to localhost:3000/api/billing/webhook`

## Taxes

Set `STRIPE_AUTOMATIC_TAX=1` after setting up Stripe Tax. Stripe calculates tax, but you
stay responsible for registering and filing it.
