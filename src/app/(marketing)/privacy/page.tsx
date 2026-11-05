import type { Metadata } from "next";
import Link from "next/link";
import { Prose } from "@/components/marketing/prose";
import { brand } from "@/lib/brand";
import { JOB_TTL_MINUTES } from "@/lib/limits";
import { REWARD_HOURS } from "@/lib/reward";
import { cloudToolsEnabled, isComingSoon, shareEnabled, tools } from "@/lib/tools";

export const metadata: Metadata = { title: "Privacy Policy", description: `How ${brand.name} handles your files and data: what stays on your device, what we keep about your account, and who helps us run the service.`, alternates: { canonical: "/privacy" } };

// Each section only describes what's switched on, so this page never promises more than the site does.
const plansOn = process.env.NEXT_PUBLIC_PLANS_ENABLED === "1";
const billingOn = process.env.NEXT_PUBLIC_BILLING_ENABLED === "1";

export default function PrivacyPage() {
  const local = tools.filter((t) => t.engine === "browser").map((t) => t.name);
  const cloud = tools.filter((t) => t.engine === "server" && !t.storage).map((t) => t.name);
  const soon = tools.filter(isComingSoon).map((t) => t.name);
  const email = <a className="text-accent underline" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>;
  return (
    <Prose title="Privacy" updated="November 2026">
      <p>This page explains what happens to your documents and your information when you use {brand.name}.</p>

      <h2>Your documents</h2>
      <p>These tools run on your device. Your file is read by your browser and <strong>isn&apos;t sent to our servers</strong>:</p>
      <p className="text-sm">{local.join(" · ")}</p>
      {!cloudToolsEnabled && soon.length > 0 && <p>These tools are marked Coming soon and aren&apos;t available yet, so they don&apos;t process your files: {soon.join(", ")}.</p>}
      <p>We don&apos;t use your documents to train AI models, and we don&apos;t read or sell them.</p>

      {cloudToolsEnabled && (
        <>
          <h2>Files processed in the cloud</h2>
          <p>These tools need server software and upload your file:</p>
          <p className="text-sm">{cloud.join(" · ")}</p>
          <ul>
            <li>Files are uploaded over HTTPS to private storage using a short-lived signed link.</li>
            <li>Files are deleted when you download the result, or by a scheduled cleanup after {JOB_TTL_MINUTES} minutes.</li>
            <li>Job records contain technical details (tool, file size, status and times), not file names or contents.</li>
          </ul>
        </>
      )}

      <h2>What&apos;s saved on your device</h2>
      <p>These stay in your browser or the desktop app and aren&apos;t uploaded. Clearing your browser data removes them.</p>
      <ul>
        <li><strong>Recovery copy:</strong> while you edit, the editor saves a copy of your document, including any images and signatures in it, so you can restore your work after a refresh. It&apos;s removed when you choose <em>Discard</em> or start a new document, and isn&apos;t offered after 7 days.</li>
        <li><strong>Signatures:</strong> signatures you create aren&apos;t uploaded. They&apos;re kept while your tab is open, and can also be part of the recovery copy.</li>
        <li><strong>Templates and custom stamps</strong> that you save.</li>
        <li><strong>Preferences,</strong> such as your theme, recently used tools and whether you&apos;ve seen the guide{plansOn ? ", and how many documents you've opened today" : ""}.</li>
      </ul>

      <h2 id="accounts">Your account</h2>
      <p>{plansOn ? `You can use ${brand.name}'s free tools without an account. Buying a plan needs a Google sign-in, because your plan is kept on your account.` : `You can use most of ${brand.name} without an account. Signing in with Google unlocks signatures, stamps, adding pages and font styles in the editor.`} Sign-in is handled by Google and Firebase Authentication.</p>
      <p>If you sign in, we keep:</p>
      <ul>
        <li>Your name, email address, profile photo and Google account ID.</li>
        <li>When you created your account and last signed in.</li>
        <li>The country we detected at your last signed-in visit, worked out from your IP address.</li>
        <li>If you use the desktop app: your operating system, app version, when you first and last used it, and how many times you&apos;ve opened it.</li>
        {plansOn && <li>Your plan and when it ends.</li>}
      </ul>
      <p>We use this to sign you in, provide your plan and run the service, and we can see it in our admin panel. Your documents aren&apos;t linked to your account or stored on it.</p>

      {billingOn && (
        <>
          <h2 id="payments">Payments</h2>
          <p>Payments are handled by Stripe, and we never see or store your full card details. Before you pay, we create a Stripe customer using your account ID, name and email, and note the plan you chose. We then keep your Stripe customer ID, your subscription&apos;s status, billing period and end date on your account. Stripe holds your payment details under its own privacy policy.</p>
        </>
      )}

      {shareEnabled && (
        <>
          <h2 id="share-links">Share links</h2>
          <ul>
            <li>When you create a share link, your file and its name are encrypted on your device before upload. The key is only in the link&apos;s final part (after the #), which browsers don&apos;t send to servers, so we can&apos;t read your file. Analytics doesn&apos;t run on the page that opens a share link.</li>
            <li>We store the encrypted file, its size, the dates it was created and expires, your account ID and email address, and any reports made about the link.</li>
            <li>Links expire after the time you choose, up to 30 days. Expired files are deleted by a daily cleanup, and you can delete a link at any time.</li>
            <li>Encrypted files are stored with Google Firebase. Because we can&apos;t read them, we can&apos;t scan them for malware. If a link is reported, we may delete it and review the account that created it.</li>
          </ul>
        </>
      )}

      {plansOn && (
        <>
          <h2 id="welcome-offer">First-time offer</h2>
          <p>We may ask first-time visitors how they found us, and offer a paid feature for {REWARD_HOURS} hours in return. To check the offer is only claimed once, we keep a scrambled version (a hash) of your IP address, not the address itself, and we check it when deciding whether to show you the offer. If you claim it, we also keep your answer, your chosen feature and its end date on your account, and your answer is counted separately in our survey results. These are stored with Google Firebase.</p>
        </>
      )}

      <h2>Analytics</h2>
      <p>We use <a className="text-accent underline" href="https://posthog.com" rel="noopener">PostHog</a>, hosted in the EU, to understand how {brand.name} is used. It records:</p>
      <ul>
        <li>The pages you visit and the site that sent you here.</li>
        <li>Your approximate location, worked out from your IP address, and your device, browser and operating system.</li>
        <li>Which buttons are clicked, without the text on the page. Inside the editor, only our own events are sent.</li>
        <li>Events such as &ldquo;a merge was completed&rdquo;, with details like the tool, page count, file type and a file-size range.</li>
      </ul>
      <p><strong>If you&apos;re not signed in,</strong> analytics uses no cookies or browser storage, and you aren&apos;t identified across days.</p>
      <p><strong>If you&apos;re signed in,</strong> this activity is tagged with your account ID, so we can see it against your email address in our admin panel, across visits.</p>
      <p>Analytics events don&apos;t include file names, document text, signatures or anything you typed, and we don&apos;t record sessions.</p>

      <h2>Companies that help us run {brand.name}</h2>
      <ul>
        <li><strong>Vercel</strong> hosts the website, and handles your IP address and requests to do so.</li>
        <li><strong>Google (Firebase)</strong> handles sign-in and stores account details.</li>
        <li><strong>PostHog</strong> provides analytics.</li>
        {billingOn && <li><strong>Stripe</strong> processes payments.</li>}
        <li><strong>GitHub</strong> hosts the desktop app, so it receives your IP address when you visit the download page or download the app.</li>
      </ul>
      <p>These companies may store information outside Australia.</p>

      <h2>Your choices</h2>
      <p>You can ask us for a copy of the information we hold about you, ask us to correct it, or ask us to delete your account, by emailing {email}.{billingOn ? " Please cancel any subscription first. Stripe and we may need to keep payment records where the law requires." : ""} If you&apos;re unhappy with how we&apos;ve handled your information, please contact us first. In Australia, you can also complain to the Office of the Australian Information Commissioner.</p>

      <h2>Changes</h2>
      <p>We&apos;ll update this page when what we do changes, and change the date at the top.</p>

      <h2>Contact</h2>
      <p>Questions? Email {email}. See also our <Link className="text-accent underline" href="/terms">terms</Link>.</p>
    </Prose>
  );
}
