import type { Metadata } from "next";
import Link from "next/link";
import { shareEnabled } from "@/lib/tools";
import { DOCUMENTS_PER_DAY, UNDO_CANCEL_MINUTES } from "@/lib/plan-limits";
import { Prose } from "@/components/marketing/prose";
import { brand } from "@/lib/brand";
import { REWARD_HOURS } from "@/lib/reward";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: `The terms for using ${brand.name}: your rights to your documents, acceptable use, plans and billing, and service availability.`,
  alternates: { canonical: "/terms" },
};

// Each section only describes what's switched on, so these terms never promise more than the site does.
const plansOn = process.env.NEXT_PUBLIC_PLANS_ENABLED === "1";
const billingOn = process.env.NEXT_PUBLIC_BILLING_ENABLED === "1";

export default function TermsPage() {
  return (
    <Prose title="Terms of use" updated="November 2026">
      <p>By using {brand.name}, you agree to these terms.</p>

      <h2>Using {brand.name}</h2>
      <p>You may use {brand.name} to work on documents you own or have permission to change. You&apos;re responsible for your documents and what you do with them, including checking your results before you rely on them.</p>

      <h2>Your account</h2>
      <p>You sign in with your Google account, and you&apos;re responsible for what happens under it. We may suspend an account that breaks these terms.</p>

      <h2>Your content</h2>
      <p>You keep all rights to your documents. We claim no ownership of them. Our <Link className="text-accent underline" href="/privacy">privacy page</Link> explains how your information is handled.</p>

      <h2>Acceptable use</h2>
      <p>Don&apos;t use the service to break the law, infringe others&apos; rights, attack our systems, or get around plan limits or usage limits.</p>

      {plansOn && (
        <>
          <h2>Free plan</h2>
          <p>The free plan includes the features listed on our <Link className="text-accent underline" href="/pricing">pricing page</Link>, including up to {DOCUMENTS_PER_DAY.free} documents a day in the editor. We may change what&apos;s free, and we&apos;ll update that page if we do.</p>
        </>
      )}

      {plansOn && (
        <>
          <h2>First-time offer</h2>
          <p>We may offer first-time users one paid feature free for {REWARD_HOURS} hours in exchange for answering a short question. It&apos;s limited to one claim per account and per IP address, for new accounts only, and it ends automatically. We may change or end this offer at any time.</p>
        </>
      )}

      {billingOn && (
        <>
          <h2>Paid plans</h2>
          <p>Each plan includes the features listed on our <Link className="text-accent underline" href="/pricing">pricing page</Link>. Tools marked Coming soon aren&apos;t part of any plan until they&apos;re released. Payments are processed by Stripe, and prices are in US dollars.</p>
          <p><strong>Renewal.</strong> Lite and Pro renew automatically each month or year until you cancel, and we charge your card at each renewal. We&apos;ll tell you before any price change takes effect.</p>
          <p><strong>Changing plan.</strong> Moving up to a higher plan, or from monthly to yearly, starts straight away, and you pay the difference at that time. Moving down, or from yearly to monthly, starts at the end of the period you&apos;ve paid for.</p>
          <p><strong>Cancelling.</strong> You can cancel at any time from <em>Manage subscription</em> in your account menu. You won&apos;t be charged again, and you keep your plan until the end of the period you&apos;ve paid for. You can undo a cancellation for {UNDO_CANCEL_MINUTES} minutes. After that, the subscription can&apos;t be restored, and you can buy a new plan once it ends. You can&apos;t change plan while a subscription is cancelled.</p>
          <p><strong>Failed payments.</strong> If a renewal payment fails, we&apos;ll try again and you keep your plan while we do. If the payment still can&apos;t be taken, your subscription is cancelled and your account moves to the free plan.</p>
          <p><strong>Refunds.</strong> We don&apos;t offer refunds for a change of mind or for unused time. If something isn&apos;t working, email {brand.supportEmail} and we&apos;ll help.</p>
        </>
      )}

      {shareEnabled && (
        <>
          <h2>Share links</h2>
          <p>You may only share files you have the right to share. Don&apos;t use share links for malware, phishing, or illegal or infringing content. We may remove any link and suspend the account behind it, including after a report, without being able to read the file. To report a link, use <em>Report this file</em> on its page. Links aren&apos;t a backup: they expire, and a lost link or password can&apos;t be recovered.</p>
        </>
      )}

      <h2>The service</h2>
      <p>We may change, add or remove features. We don&apos;t promise the service will always be available or free of errors. Tools marked Coming soon aren&apos;t available yet. Conversions may not keep every detail of the original layout, so keep a copy of your original files.</p>

      <h2>Your rights under the law</h2>
      <p>Nothing in these terms limits rights you have under the Australian Consumer Law or other consumer protection laws that apply to you. Apart from those rights, the service is provided &ldquo;as is&rdquo;, and to the extent the law allows, we aren&apos;t liable for indirect losses or for lost data or documents.</p>

      <h2>Changes</h2>
      <p>We may update these terms, and we&apos;ll change the date at the top when we do. If you keep using {brand.name} after that, the new terms apply.</p>

      <h2>Contact</h2>
      <p>Questions? Email <a className="text-accent underline" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</p>
    </Prose>
  );
}
