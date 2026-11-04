"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Copy, Link2, Loader2, Minimize2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Progress, Segmented } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { requireAuth, useAuth } from "@/lib/auth/store";
import { compressPdf, compressPresets } from "@/lib/pdf/ops";
import { encryptedSize, sealFile } from "@/lib/share/crypto";
import { track } from "@/lib/analytics";
import { formatBytes } from "@/lib/utils";
import { PageThumb, usePdf } from "@/components/tools/shared";

const MAX_SHARE_BYTES = 5 * 1024 * 1024;
const MAX_LABEL = "5 MB";
type Days = "1" | "7" | "30";
type Level = "recommended" | "high";
interface ShareLink { id: string; size: number; createdAt: number; expiresAt: number }
const dated = (t: number) => new Date(t).toLocaleDateString(undefined, { dateStyle: "medium" });

async function authHeaders(): Promise<Record<string, string>> {
  if (!useAuth.getState().user) return {};
  const { currentIdToken } = await import("@/lib/auth/firebase");
  const token = await currentIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** The same page before and after compressing, so the quality can be judged before sharing. */
function ComparePreview({ before, after }: { before: Uint8Array; after: Uint8Array }) {
  const a = usePdf(before);
  const b = usePdf(after);
  const [page, setPage] = useState(0);
  const count = b.doc?.numPages ?? 0;
  return (
    <div className="rounded-xl bg-surface-2 p-3" data-testid="compress-preview">
      <div className="flex flex-wrap justify-center gap-3">
        {[{ label: "Original", doc: a.doc }, { label: "Compressed", doc: b.doc }].map(({ label, doc }) => (
          <figure key={label} className="min-w-0">
            <figcaption className="mb-1 text-center text-[12px] font-medium text-ink-2">{label}</figcaption>
            {doc ? <PageThumb key={page} doc={doc} index={page} width={230} /> : <div className="h-72 w-[230px] animate-pulse rounded bg-surface" />}
          </figure>
        ))}
      </div>
      {count > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2 text-[13px] text-ink-2">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous page</Button>
          <span className="tabular-nums">Page {page + 1} of {count}</span>
          <Button variant="ghost" size="sm" disabled={page >= count - 1} onClick={() => setPage(page + 1)}>Next page</Button>
        </div>
      )}
    </div>
  );
}

/** Encrypt in the browser, upload, and hand back a link holding the only copy of the key. */
export function ShareForm({ getFile }: { getFile: () => Promise<{ name: string; bytes: Uint8Array }> }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [level, setLevel] = useState<Level>("recommended");
  const [compressing, setCompressing] = useState<number | null>(null);
  const [compressed, setCompressed] = useState<Uint8Array | null>(null);
  const [useSmaller, setUseSmaller] = useState(false);
  const [days, setDays] = useState<Days>("7");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ url: string; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const uid = useAuth((s) => s.user?.uid);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/share", { headers: await authHeaders(), cache: "no-store" }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setAvailable(!!body?.available);
    setLinks(body?.links ?? []);
  }, []);
  useEffect(() => { void refresh(); }, [refresh, uid]);

  // The size decides what can happen next, so it's checked before anything else.
  useEffect(() => {
    let alive = true;
    getFile().then((f) => { if (alive) setFile(f); }).catch(() => { if (alive) setError("We couldn't prepare this document. Please try again."); });
    return () => { alive = false; };
  }, [getFile]);

  const chosen = useSmaller && compressed ? compressed : file?.bytes ?? null;
  const tooBig = !!chosen && chosen.length > MAX_SHARE_BYTES;

  const compress = async () => {
    if (!file) return;
    setError(null);
    setCompressed(null);
    setUseSmaller(false);
    setCompressing(0);
    try {
      const out = await compressPdf(file.bytes, compressPresets[level], (done, total) => setCompressing(total ? (done / total) * 100 : 0));
      track("conversion_completed", { tool: "share-compress" });
      setCompressed(out);
      // Over the limit there's no choice to make, so pick the version that can be shared.
      if (out.length < file.bytes.length && file.bytes.length > MAX_SHARE_BYTES) setUseSmaller(true);
    } catch {
      setError("We couldn't compress this document. Please try again.");
    } finally {
      setCompressing(null);
    }
  };

  const create = async () => {
    setError(null);
    if (!chosen || !file || tooBig) return;
    if (!requireAuth("share", () => void create())) return;
    try {
      setBusy("Encrypting on your device");
      const sealed = await sealFile(chosen, file.name, password || undefined);
      setBusy("Uploading the encrypted file");
      const headers = await authHeaders();
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ size: encryptedSize(chosen.length), days: Number(days), nameCt: sealed.nameCt, salt: sealed.salt, iterations: sealed.iterations }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) throw new Error(body?.message ?? "We couldn't create the link. Please try again.");
      const put = await fetch(body.uploadUrl, { method: "PUT", headers: body.uploadHeaders, body: sealed.data as BodyInit });
      if (!put.ok) throw new Error("The upload didn't complete. Please try again.");
      const done = await fetch(`/api/share/${body.id}/complete`, { method: "POST", headers });
      if (!done.ok) throw new Error("The upload didn't complete. Please try again.");
      track("conversion_completed", { tool: "share-pdf" });
      setMade({ url: `${location.origin}/s/${body.id}#k=${sealed.secret}`, expiresAt: body.expiresAt });
      setPassword("");
      void refresh();
    } catch (e) {
      setError(e instanceof Error && e.message.length < 160 ? e.message : "We couldn't create the link. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(made!.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link", "Select the link and copy it yourself.");
    }
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this link? It will stop working for everyone.")) return;
    const res = await fetch(`/api/share/${id}`, { method: "DELETE", headers: await authHeaders() }).catch(() => null);
    if (!res?.ok) { toast.error("Couldn't delete the link", "Please try again."); return; }
    void refresh();
  };

  if (available === null || (!file && !error)) return <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-label="Preparing your document" />;
  if (!available) return <p role="status" className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">Share links aren&apos;t available right now.</p>;
  if (!file) return <p role="alert" className="text-sm text-danger">{error}</p>;

  const original = file.bytes.length;
  const originalTooBig = original > MAX_SHARE_BYTES;
  const saved = compressed && compressed.length < original;

  return (
    <div className="space-y-4 text-left">
      {made ? (
        <div className="space-y-3 rounded-2xl border border-accent/30 bg-accent-soft p-4" data-testid="share-result">
          <p className="flex items-center gap-2 font-semibold text-ink"><Check className="size-5 text-accent" /> Your link is ready</p>
          <div className="flex gap-2">
            <Input readOnly value={made.url} aria-label="Share link" data-testid="share-url" onFocus={(e) => e.target.select()} />
            <Button onClick={() => void copy()}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}</Button>
          </div>
          <p className="text-[13px] text-ink-2">Anyone with this link can download the file until {dated(made.expiresAt)}. Save it now, because we can&apos;t show it again: the key to your file is only in the link, and we never see it.</p>
          <Button variant="outline" onClick={() => setMade(null)}>Create another link</Button>
        </div>
      ) : busy ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-8 text-sm" aria-live="polite"><Loader2 className="size-4 animate-spin" /> {busy}…</div>
      ) : (
        <>
          <div className="space-y-3 rounded-xl border border-border bg-surface p-3.5" data-testid="share-size">
            <p className="text-[13.5px]">
              <span className="font-semibold">File size: {formatBytes(chosen!.length)}</span>
              <span className="text-ink-3"> · share links can hold up to {MAX_LABEL}</span>
            </p>
            {tooBig && (
              <p role="alert" className="flex items-start gap-2 text-[13px] text-danger" data-testid="share-too-big">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {compressed ? "This is still too large. Try High compression, or remove some pages." : `This file is over ${MAX_LABEL}. Compress it to share it.`}
              </p>
            )}
            <Segmented label="Compression level" value={level} onChange={setLevel} options={[{ value: "recommended", label: "Recommended" }, { value: "high", label: "High compression" }]} />
            {compressing !== null ? (
              <div aria-live="polite"><p className="mb-1.5 text-[13px] text-ink-2">Compressing…</p><Progress value={compressing} /></div>
            ) : (
              <Button variant={tooBig ? "primary" : "outline"} className="w-full" onClick={() => void compress()}><Minimize2 /> {compressed ? "Compress again" : "Compress"}</Button>
            )}
            {compressed && compressing === null && (
              <>
                <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium" data-testid="compress-result">
                  {formatBytes(original)} <ArrowRight className="size-3.5 text-ink-3" aria-hidden /> {formatBytes(compressed.length)}
                  {saved ? <span className="font-normal text-ink-3">({Math.round((1 - compressed.length / original) * 100)}% smaller)</span> : <span className="font-normal text-ink-3">(this file can&apos;t be made smaller)</span>}
                </p>
                {saved && (
                  <>
                    <ComparePreview before={file.bytes} after={compressed} />
                    <Segmented label="Version to share" value={useSmaller ? "compressed" : "original"} onChange={(v) => setUseSmaller(v === "compressed")}
                      options={[{ value: "compressed", label: "Share compressed" }, { value: "original", label: `Share original${originalTooBig ? " (too large)" : ""}` }]} />
                    <p className="text-[12.5px] text-ink-3">Compressing only changes the shared copy, not your document.</p>
                  </>
                )}
              </>
            )}
          </div>
          <Segmented label="Link expires after" value={days} onChange={setDays} options={[{ value: "1", label: "1 day" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }]} />
          <Field label="Password (optional)" hint="Send the password separately. If it's lost, the file can't be recovered.">
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button size="lg" className="w-full" disabled={tooBig || compressing !== null} onClick={() => void create()}><Link2 /> Create link</Button>
          <p className="text-[12.5px] text-ink-3">Your file is encrypted on this device before it&apos;s uploaded, so we can&apos;t read it. Only share files you have the right to share.</p>
        </>
      )}
      {links.length > 0 && (
        <div>
          <p className="mb-1.5 text-[13px] font-semibold">Your active links</p>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface" aria-label="Your active links">
            {links.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-3.5 py-2 text-[13px]" data-testid="share-link-row" data-share-id={l.id}>
                <span className="min-w-0 flex-1 truncate text-ink-2">Encrypted file · {formatBytes(l.size)} · created {dated(l.createdAt)} · expires {dated(l.expiresAt)}</span>
                <Button size="icon-sm" variant="ghost" aria-label="Delete link" onClick={() => void remove(l.id)}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
