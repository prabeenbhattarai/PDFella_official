import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, KeyRound } from "lucide-react";
import { API_BASE_URL, API_LIMITS, API_VERSION, ENDPOINTS, ERROR_CODES, paramsOf, type ApiEndpoint, type ApiParam } from "@/lib/api/spec";
import { brand } from "@/lib/brand";

const TITLE = `PDF API for Developers: Merge, Split, Watermark & Protect | ${brand.name}`;
const DESCRIPTION = `The ${brand.name} REST API: merge, split, rotate, watermark, number, protect, unlock and convert PDFs from your own app with the same engine as ${brand.name}.`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: ["pdf api", "pdf rest api", "merge pdf api", "watermark pdf api", "pdf to text api", "protect pdf api"],
  alternates: { canonical: "/developers" },
  openGraph: { type: "website", title: TITLE, description: DESCRIPTION, url: "/developers" },
};

const BASE = `${API_BASE_URL}/${API_VERSION}`;
const KEY_MAIL = `mailto:${brand.supportEmail}?subject=${encodeURIComponent(`${brand.name} API key request`)}&body=${encodeURIComponent("Company / project:\nWhat you'll use the API for:\nExpected monthly requests:\n")}`;
const groups = [...new Set(ENDPOINTS.map((e) => e.group))];
const mb = (n: number) => `${n / 1024 / 1024} MB`;

/** Render `code` spans in spec descriptions. */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/).map((part, i) => (part.startsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : part))}</>;
}

function curlFor(e: ApiEndpoint) {
  const lines = [`curl ${BASE}${e.path} \\`, `  -H "Authorization: Bearer $PDFELLA_API_KEY" \\`];
  for (const f of e.files.filter((f) => f.required)) {
    const ext = f.accepts[0];
    const names = f.multiple ? [`first.${ext}`, `second.${ext}`] : [`document.${ext}`];
    for (const n of names) lines.push(`  -F "${f.name}=@${n}" \\`);
  }
  for (const p of e.params.filter((p) => p.required || p.example !== undefined).slice(0, 3)) lines.push(`  -F "${p.name}=${p.example ?? p.default ?? ""}" \\`);
  lines.push(`  -o ${e.returns.contentType.startsWith("text/") ? "output.txt" : e.returns.contentType === "application/zip" ? "output.zip" : "output.pdf"}`);
  return lines.join("\n");
}

function typeLabel(p: ApiParam) {
  if (p.enum) return p.enum.join(" | ");
  return p.type === "pages" ? "page ranges" : p.type === "color" ? "#rrggbb" : p.type;
}

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-xl border border-border bg-surface-2 p-4 font-mono text-[12.5px] leading-relaxed text-ink">{children}</pre>;
}

function Endpoint({ e }: { e: ApiEndpoint }) {
  const params = paramsOf(e);
  return (
    <section id={e.id} className="scroll-mt-28 border-t border-border pt-10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-xl font-semibold text-ink">{e.title}</h3>
        <Link href={`/${e.tool}`} className="text-[13px] text-accent hover:underline">Same as the {brand.name} tool</Link>
      </div>
      <p className="mt-2 font-mono text-[13px]"><span className="rounded bg-accent-soft px-1.5 py-0.5 font-semibold text-accent">POST</span> <span className="text-ink">/{API_VERSION}{e.path}</span></p>
      <p className="mt-3 text-ink-2"><Rich text={e.summary} /></p>

      <table className="mt-5 text-[14px]">
        <thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead>
        <tbody>
          {e.files.map((f) => (
            <tr key={f.name}>
              <td className="align-top font-mono text-[13px] text-ink">{f.name}{f.multiple ? "[]" : ""}{f.required && <span className="ml-1 text-danger">*</span>}</td>
              <td className="align-top whitespace-nowrap">{f.multiple ? "files" : "file"}: {f.accepts.map((a) => a.toUpperCase()).join(", ")}</td>
              <td><Rich text={f.description} /></td>
            </tr>
          ))}
          {params.map((p) => (
            <tr key={p.name}>
              <td className="align-top font-mono text-[13px] text-ink">{p.name}{p.required && <span className="ml-1 text-danger">*</span>}</td>
              <td className="align-top text-[13px]">{typeLabel(p)}</td>
              <td><Rich text={p.description} />{p.default !== undefined && <span className="text-ink-3"> Default <code>{String(p.default)}</code>.</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-[14px]"><strong>Returns</strong> <code>{e.returns.contentType.split(";")[0]}</code>: {e.returns.description}</p>
      <div className="mt-4"><Code>{curlFor(e)}</Code></div>
    </section>
  );
}

export default function DevelopersPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
      <nav aria-label="API reference" className="hidden lg:block">
        <div className="sticky top-28 space-y-5 text-[13.5px]">
          <ul className="space-y-1.5">
            {[["start", "Quick start"], ["auth", "Authentication"], ["limits", "Limits"], ["errors", "Errors"], ["versioning", "Versioning"]].map(([id, label]) => (
              <li key={id}><a href={`#${id}`} className="text-ink-2 hover:text-ink">{label}</a></li>
            ))}
          </ul>
          {groups.map((g) => (
            <div key={g}>
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-3">{g}</p>
              <ul className="space-y-1.5">
                {ENDPOINTS.filter((e) => e.group === g).map((e) => <li key={e.id}><a href={`#${e.id}`} className="text-ink-2 hover:text-ink">{e.title}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <article className="min-w-0 text-[15px] leading-relaxed text-ink-2 [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.88em] [&_code]:text-ink [&_h2]:scroll-mt-28 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-ink [&_table]:w-full [&_td]:border-t [&_td]:border-border [&_td]:py-2 [&_td]:pr-4 [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:text-[13px] [&_th]:font-semibold [&_th]:text-ink">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-accent">{brand.name} API · {API_VERSION}</p>
        <h1 className="mt-2 font-display text-5xl tracking-tight text-ink">PDF tools for your own app</h1>
        <p className="mt-4 max-w-2xl text-[17px]">
          Merge, split, rotate, watermark, number, protect, unlock and extract text from PDFs with a simple REST API. It runs the same engine as {brand.name}, so every improvement to our tools reaches your integration automatically.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href={KEY_MAIL} className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-5 text-[14px] font-semibold text-bg hover:opacity-90"><KeyRound className="size-4" /> Request an API key</a>
          <a href={`${BASE}/openapi.json`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border-strong px-5 text-[14px] font-semibold text-ink hover:bg-surface-2">OpenAPI spec <ArrowRight className="size-4" /></a>
        </div>

        <div className="mt-16 space-y-5">
          <h2 id="start">Quick start</h2>
          <p>Send files as <code>multipart/form-data</code>. The processed file comes back in the response body, so there&apos;s nothing to poll or download separately.</p>
          <Code>{`curl ${BASE}/merge \\\n  -H "Authorization: Bearer $PDFELLA_API_KEY" \\\n  -F "files=@first.pdf" \\\n  -F "files=@second.pdf" \\\n  -o merged.pdf`}</Code>
          <Code>{`// Node.js 18+
const form = new FormData();
form.append("file", new Blob([await fs.promises.readFile("report.pdf")]), "report.pdf");
form.append("text", "CONFIDENTIAL");

const res = await fetch("${BASE}/watermark", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.PDFELLA_API_KEY}\` },
  body: form,
});
if (!res.ok) throw new Error((await res.json()).error.message);
await fs.promises.writeFile("report-watermarked.pdf", Buffer.from(await res.arrayBuffer()));`}</Code>
          <p>Prefer a GUI? Import the <a className="text-accent underline" href={`${BASE}/openapi.json`}>OpenAPI spec</a> into Postman or Insomnia (<em>Import → Link</em>) to get a ready-made collection of every endpoint.</p>

          <h2 id="auth" className="pt-6">Authentication</h2>
          <p>Every request needs your API key in the <code>Authorization</code> header: <code>Bearer pdfella_sk_…</code>. Keys are secret: call the API from your server, never from a browser or mobile app where users could read the key. If a key leaks, tell us and we&apos;ll revoke it and issue a new one.</p>
          <p><code>GET /{API_VERSION}/me</code> returns your key&apos;s name, rate limit and request counts for the last 30 days.</p>

          <h2 id="limits" className="pt-6">Limits</h2>
          <table>
            <tbody>
              <tr><td>File size</td><td>{mb(API_LIMITS.maxFileBytes)} per file, {mb(API_LIMITS.maxRequestBytes)} per request</td></tr>
              <tr><td>Files per request</td><td>{API_LIMITS.maxFiles}</td></tr>
              <tr><td>Rate limit</td><td>{API_LIMITS.defaultRatePerMinute} requests per minute per key (higher on request). Responses include <code>X-RateLimit-Limit</code> and <code>X-RateLimit-Remaining</code>.</td></tr>
              <tr><td>Data retention</td><td>None. Files are processed in memory and discarded when the response is sent. We log only the endpoint, status, size and timing.</td></tr>
            </tbody>
          </table>

          <h2 id="errors" className="pt-6">Errors</h2>
          <p>Errors return JSON: <code>{`{ "error": { "code": "…", "message": "…" } }`}</code>. The <code>message</code> is written for developers and safe to log.</p>
          <table>
            <thead><tr><th>Status</th><th>Code</th><th>Meaning</th></tr></thead>
            <tbody>{ERROR_CODES.map((c) => <tr key={c.code}><td className="align-top">{c.status}</td><td className="align-top font-mono text-[13px] text-ink">{c.code}</td><td><Rich text={c.description} /></td></tr>)}</tbody>
          </table>

          <h2 id="versioning" className="pt-6">Versioning</h2>
          <p>The API is versioned in the path (<code>/{API_VERSION}</code>). Within a version we only make backwards-compatible changes: new endpoints, new optional fields and better output from the same engine as {brand.name}. Anything that could break an integration ships as a new version, announced well in advance. Every response carries an <code>X-PDFella-API-Version</code> header.</p>
          <p>Password-protected PDFs: every endpoint that reads a PDF accepts an optional <code>password</code> field. PDFs that only restrict printing or copying open without one.</p>
        </div>

        <div className="mt-16">
          <h2>Endpoints</h2>
          {groups.map((g) => (
            <div key={g} className="mt-8">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">{g}</p>
              <div className="mt-2 space-y-10">{ENDPOINTS.filter((e) => e.group === g).map((e) => <Endpoint key={e.id} e={e} />)}</div>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-border bg-surface-2 p-6">
          <p className="text-lg font-semibold text-ink">Ready to integrate?</p>
          <p className="mt-1">Tell us about your project and we&apos;ll send you a key.</p>
          <a href={KEY_MAIL} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-[14px] font-semibold text-bg hover:opacity-90"><KeyRound className="size-4" /> Request an API key</a>
        </div>
      </article>
    </div>
  );
}
