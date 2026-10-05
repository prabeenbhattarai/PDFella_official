import type { Metadata } from "next";
import { Prose } from "@/components/marketing/prose";
import { brand } from "@/lib/brand";
import { JOB_TTL_MINUTES } from "@/lib/limits";

export const metadata: Metadata = { title: "Security", description: `How ${brand.name} protects your documents: in-browser editing, encrypted transfers, signed short-lived links and automatic deletion of uploads.`, alternates: { canonical: "/security" } };

export default function SecurityPage() {
  return (
    <Prose title="Security" updated="October 2026">
      <p>People trust us with contracts, IDs and financial records. These are the controls that protect them.</p>
      <h2>Local-first architecture</h2>
      <p>Editing, signing, annotating, organising, watermarking, compression and image conversion run in your browser. The safest upload is the one that never happens.</p>
      <h2>Cloud processing controls</h2>
      <ul>
        <li>TLS for all traffic; HSTS preloaded.</li>
        <li>Private storage only reachable through signed URLs that expire after 15 minutes.</li>
        <li>Content-based file type validation. The file extension is never trusted.</li>
        <li>Per-file size limits and per-client rate limits.</li>
        <li>Processing in non-root, resource-limited containers with no outbound internet access and a strict time limit per job.</li>
        <li>Pluggable malware scanning before processing.</li>
        <li>Automatic deletion after {JOB_TTL_MINUTES} minutes, with a 24-hour storage lifecycle backstop.</li>
      </ul>
      <h2>Web application</h2>
      <ul>
        <li>Strict Content Security Policy, frame-ancestors none, no third-party scripts in the editor.</li>
        <li>Hyperlinks added to PDFs are limited to http(s) and mailto, never JavaScript.</li>
        <li>True redaction: redacted content is removed from the output file, not only covered.</li>
      </ul>
      <h2>Reporting a vulnerability</h2>
      <p>Please email <a className="text-accent underline" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>. We respond within two business days.</p>
    </Prose>
  );
}
