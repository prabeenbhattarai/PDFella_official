"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Download, FileText, Flag, Loader2, Lock, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { LogoLoader } from "@/components/ui/logo-loader";
import { toast } from "@/components/ui/toast";
import { linkKey, openFile, openName } from "@/lib/share/crypto";
import { sniffBytes } from "@/lib/security/filetype";
import { handoff } from "@/lib/storage/local";
import { brand } from "@/lib/brand";
import { downloadBlob, formatBytes, sanitizeFileName } from "@/lib/utils";

interface Meta { nameCt: string; salt: string | null; iterations: number | null; size: number; expiresAt: number; url: string }
type State =
  | { k: "loading" }
  | { k: "problem"; title: string; body: string }
  | { k: "password"; meta: Meta; wrong: boolean }
  | { k: "ready"; meta: Meta; key: CryptoKey; name: string };

const REASONS = [
  { value: "malware", label: "It contains malware or a virus" },
  { value: "phishing", label: "It's a scam or phishing" },
  { value: "copyright", label: "It infringes copyright" },
  { value: "illegal", label: "It's illegal or harmful" },
  { value: "other", label: "Something else" },
];

const fetchMeta = async (id: string): Promise<Meta | null> => {
  const res = await fetch(`/api/share/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (res.ok) return res.json();
  if (res.status === 404) return null;
  throw new Error("request failed");
};

/** Decrypts in the recipient's browser. The key stays in the #fragment and is never sent anywhere. */
export function SharedFile({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ k: "loading" });
  const [secret, setSecret] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"download" | "edit" | "unlock" | null>(null);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    const key = new URLSearchParams(location.hash.slice(1)).get("k") ?? "";
    setSecret(key);
    void (async () => {
      try {
        const meta = await fetchMeta(id);
        if (!meta) { setState({ k: "problem", title: "This link is no longer available", body: "It may have expired or been removed by the person who shared it." }); return; }
        if (!key) { setState({ k: "problem", title: "This link is incomplete", body: "Part of the link is missing, and it's needed to open the file. Ask the sender to send the whole link again." }); return; }
        if (meta.salt) { setState({ k: "password", meta, wrong: false }); return; }
        const cryptoKey = await linkKey({ secret: key, salt: null, iterations: null });
        setState({ k: "ready", meta, key: cryptoKey, name: await openName(cryptoKey, meta.nameCt) });
      } catch {
        setState({ k: "problem", title: "We couldn't open this link", body: "Check that you copied the whole link, then try again." });
      }
    })();
  }, [id]);

  const unlock = async (meta: Meta) => {
    setBusy("unlock");
    try {
      const key = await linkKey({ secret, salt: meta.salt, iterations: meta.iterations, password });
      setState({ k: "ready", meta, key, name: await openName(key, meta.nameCt) });
    } catch {
      setState({ k: "password", meta, wrong: true });
    } finally {
      setBusy(null);
    }
  };

  /** Fetch a fresh URL (the signed one is short-lived), decrypt, and insist on a real PDF. */
  const decrypt = useCallback(async (key: CryptoKey): Promise<Uint8Array> => {
    const meta = await fetchMeta(id);
    if (!meta) throw new Error("This link is no longer available.");
    const res = await fetch(meta.url);
    if (!res.ok) throw new Error("We couldn't download the file. Please try again.");
    const bytes = await openFile(key, new Uint8Array(await res.arrayBuffer()));
    if (sniffBytes(bytes.subarray(0, 4096)) !== "pdf") throw new Error("This file isn't a PDF, so it wasn't opened.");
    return bytes;
  }, [id]);

  const run = async (kind: "download" | "edit", s: Extract<State, { k: "ready" }>) => {
    setBusy(kind);
    try {
      const bytes = await decrypt(s.key);
      const name = sanitizeFileName(s.name);
      if (kind === "download") {
        downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), name);
      } else {
        await handoff.put([{ name, type: "application/pdf", bytes }]);
        router.push("/editor");
        return;
      }
    } catch (e) {
      toast.error("Couldn't open the file", e instanceof Error && e.message.length < 120 ? e.message : "Please try again.");
    }
    setBusy(null);
  };

  if (state.k === "loading") return <div className="flex justify-center py-24 text-ink-3"><Loader2 className="size-6 animate-spin" aria-label="Loading" /></div>;
  if (state.k === "problem") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center" role="alert">
        <AlertTriangle className="mx-auto mb-3 size-8 text-ink-3" />
        <h1 className="text-xl font-semibold">{state.title}</h1>
        <p className="mt-2 text-sm text-ink-3">{state.body}</p>
        <Link href="/" className="mt-5 inline-block text-sm font-medium text-accent hover:underline">Go to {brand.name}</Link>
      </div>
    );
  }
  if (state.k === "password") {
    return (
      <form className="space-y-4 rounded-2xl border border-border bg-surface p-6" onSubmit={(e) => { e.preventDefault(); void unlock(state.meta); }}>
        <div className="flex items-center gap-3">
          <Lock className="size-6 shrink-0 text-accent" />
          <div><h1 className="text-lg font-semibold">This file needs a password</h1><p className="text-sm text-ink-3">Ask the person who shared it with you.</p></div>
        </div>
        <Field label="Password">{(fid) => <Input id={fid} type="password" autoFocus autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        {state.wrong && <p role="alert" className="text-sm text-danger">That password isn&apos;t right.</p>}
        <Button type="submit" size="lg" className="w-full" disabled={!password || busy === "unlock"}>{busy === "unlock" && <Loader2 className="animate-spin" />} Unlock</Button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      {busy === "edit" && <LogoLoader overlay label="Opening the editor…" hint="Decrypting your document" />}
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-[13px] font-medium text-ink-3">A PDF was shared with you</p>
        <div className="mt-3 flex items-center gap-3">
          <FileText className="size-8 shrink-0 text-accent" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold" data-testid="shared-name">{state.name}</h1>
            <p className="text-sm text-ink-3">{formatBytes(state.meta.size)} · available until {new Date(state.meta.expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="lg" className="flex-1" disabled={!!busy} onClick={() => void run("download", state)} data-testid="shared-download">{busy === "download" ? <Loader2 className="animate-spin" /> : <Download />} Download</Button>
          <Button size="lg" variant="outline" disabled={!!busy} onClick={() => void run("edit", state)}><PencilLine /> Open in editor</Button>
        </div>
        <p className="mt-4 text-[12.5px] text-ink-3">This file was uploaded by another person and encrypted, so {brand.name} hasn&apos;t checked it. Only open files from people you trust.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-3">
        <span>Shared with <Link className="font-medium text-accent hover:underline" href="/share-pdf">{brand.name}</Link>. Share your own PDF for free.</span>
        <button type="button" onClick={() => setReporting(true)} className="inline-flex items-center gap-1.5 hover:text-ink"><Flag className="size-3.5" /> Report this file</button>
      </div>
      <ReportDialog id={id} open={reporting} onClose={() => setReporting(false)} />
    </div>
  );
}

function ReportDialog({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("malware");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    const res = await fetch(`/api/share/${encodeURIComponent(id)}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, details }) }).catch(() => null);
    setSending(false);
    if (!res?.ok) { toast.error("Couldn't send your report", "Please try again."); return; }
    toast.success("Thanks for reporting this", "We'll review it and remove the link if needed.");
    setDetails("");
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title="Report this file" description="Tell us what's wrong. Your report doesn't include the file or its key."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={sending} onClick={() => void send()}>Send report</Button></>}>
      <div className="space-y-3">
        <Field label="What's the problem?">{(fid) => <Select id={fid} value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select>}</Field>
        <Field label="Details (optional)">{(fid) => <Input id={fid} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}
