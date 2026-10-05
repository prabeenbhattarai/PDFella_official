import type { Metadata } from "next";
import { Prose } from "@/components/marketing/prose";
import { brand } from "@/lib/brand";
import { JOB_TTL_MINUTES } from "@/lib/limits";
import { tools } from "@/lib/tools";

export const metadata: Metadata = { title: "Privacy Policy", description: `How ${brand.name} handles your files and data: what stays in your browser, what is uploaded for conversion, and what we never collect.`, alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  const local = tools.filter((t) => t.engine === "browser").map((t) => t.name);
  const cloud = tools.filter((t) => t.engine === "server").map((t) => t.name);
  return (
    <Prose title="Privacy" updated="October 2026">
      <p>This page explains, in plain language, what happens to the documents you work on with {brand.name}. We only make claims here that our software actually enforces.</p>

      <h2>Files processed in your browser</h2>
      <p>These tools run entirely on your device. Your file is read into your browser&apos;s memory and is <strong>never sent to our servers</strong>:</p>
      <p className="text-sm">{local.join(" · ")}</p>
      <p>While you edit, the editor keeps an automatic recovery copy in your browser&apos;s local storage (IndexedDB) so you can restore your work after an accidental refresh. It never leaves your device, expires after 7 days, and is removed when you choose <em>Discard</em> or start a new document.</p>

      <h2>Files processed in the cloud</h2>
      <p>These tools need server software (such as OCR or Office conversion) and therefore upload your file:</p>
      <p className="text-sm">{cloud.join(" · ")}</p>
      <ul>
        <li>Files are uploaded over HTTPS directly to a private storage bucket using a short-lived, single-use signed link. The bucket is never publicly readable.</li>
        <li>Each job is processed in an isolated container without general internet access.</li>
        <li>Input and output files are deleted as soon as you download the result. If you don&apos;t, a scheduled cleanup deletes them after <strong>{JOB_TTL_MINUTES} minutes</strong>, and a storage lifecycle rule permanently removes anything older than 24 hours as a backstop.</li>
        <li>Job records contain only technical metadata (tool, file size, status, timestamps), never file names or contents, and they expire automatically.</li>
      </ul>

      <h2>What we never do</h2>
      <ul>
        <li>We do not use your documents to train AI models.</li>
        <li>We do not read, analyse, index or sell document contents.</li>
        <li>We do not log document text, file names, signatures or form values.</li>
        <li>We do not require an account to use any tool.</li>
      </ul>

      <h2>Signatures</h2>
      <p>Signatures you create are kept only in the memory of the current browser tab and are discarded when you close it. We never upload or store them.</p>

      <h2>Analytics</h2>
      <p>If enabled, we record anonymous usage events such as “a merge was completed” together with coarse details like page count or a file-size bucket. Events never include file names, document text or anything you typed.</p>

      <h2>Third parties</h2>
      <p>Cloud processing runs on Google Cloud (Cloud Run and Cloud Storage) in our own project. No document is sent to any other third-party service unless a tool explicitly says so.</p>

      <h2>Contact</h2>
      <p>Questions? Email <a className="text-accent underline" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.</p>
    </Prose>
  );
}
