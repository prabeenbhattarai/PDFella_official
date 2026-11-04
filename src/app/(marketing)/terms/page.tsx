import type { Metadata } from "next";
import { shareEnabled } from "@/lib/tools";
import { Prose } from "@/components/marketing/prose";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: `The terms for using ${brand.name}, the free online PDF editor: your rights to your documents, acceptable use and service availability.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <Prose title="Terms of use" updated="October 2026">
      <p>These placeholder terms must be reviewed by counsel before launch.</p>
      <h2>Using {brand.name}</h2>
      <p>You may use {brand.name} to work on documents you own or have permission to modify. You are responsible for the content you process.</p>
      <h2>Your content</h2>
      <p>You keep all rights to your documents. We claim no ownership and use them only to provide the service you request, as described in our Privacy page.</p>
      <h2>Acceptable use</h2>
      <p>Do not use the service to break the law, infringe others&apos; rights, attack our infrastructure, or circumvent usage limits.</p>
      {shareEnabled && (
        <>
          <h2>Share links</h2>
          <p>You may only share files you have the right to share. Do not use share links for malware, phishing, or illegal or infringing content. We may remove any link and suspend the account behind it, including after a report, without being able to read the file. To report a link, use <em>Report this file</em> on its page. Links are not a backup: they expire, and a lost link or password can&apos;t be recovered.</p>
        </>
      )}
      <h2>Availability</h2>
      <p>The service is provided “as is”. Conversions between formats may not preserve every detail of the original layout.</p>
    </Prose>
  );
}
