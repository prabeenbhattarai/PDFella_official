"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogoLoader } from "@/components/ui/logo-loader";
import { useSearchParams, useRouter } from "next/navigation";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { CheckCircle2, Download, FileText, PencilLine, RotateCcw, X, AlertTriangle, ArrowRight, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Progress } from "@/components/ui/form";
import { Dropzone, type AcceptedFile } from "@/components/upload/dropzone";
import { openPdf, PasswordRequiredError } from "@/lib/pdf/pdfjs";
import { handoff } from "@/lib/storage/local";
import { downloadBlob, formatBytes, sanitizeFileName, stripExtension, cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import type { Tool } from "@/lib/tools";
import { ensureUnlocked } from "@/lib/pdf/unlock";

export interface LoadedFile { id: string; name: string; bytes: Uint8Array; type: string; size: number }

let n = 0;
export const toLoaded = (f: AcceptedFile): LoadedFile => ({ id: `f${++n}`, name: f.file.name, bytes: f.bytes, type: f.file.type || f.kind, size: f.file.size });

/** Files handed over from the editor's completion screen (e.g. "Compress"). */
export function useHandoffFiles(onFiles: (f: LoadedFile[]) => void) {
  const params = useSearchParams();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !params.get("from")) return;
    done.current = true;
    handoff.take().then((files) => {
      if (files?.length) onFiles(files.map((f) => ({ id: `f${++n}`, name: f.name, bytes: f.bytes, type: f.type, size: f.bytes.length })));
    });
  }, [params, onFiles]);
}

/** Opens a PDF with pdf.js for previews; surfaces password-protected files. */
export function usePdf(bytes: Uint8Array | null) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!bytes) { setDoc(null); return; }
    let alive = true;
    let opened: PDFDocumentProxy | null = null;
    setError(null);
    openPdf(bytes).then((d) => { opened = d; if (alive) setDoc(d); else d.destroy(); }).catch((e) => {
      if (alive) setError(e instanceof PasswordRequiredError ? "This PDF is password protected. Unlock it first with Unlock PDF." : "We couldn't read this PDF. It may be damaged.");
    });
    return () => { alive = false; opened?.destroy(); };
  }, [bytes]);
  return { doc, error };
}

export function PageThumb({ doc, index, rotation = 0, width = 130, className }: { doc: PDFDocumentProxy; index: number; rotation?: number; width?: number; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [ratio, setRatio] = useState(1.3);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const page = await doc.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      if (alive) setRatio(base.height / base.width);
      const vp = page.getViewport({ scale: (width * 1.6) / base.width });
      const c = document.createElement("canvas");
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise.catch(() => {});
      if (alive) setUrl(c.toDataURL("image/jpeg", 0.75));
      c.width = c.height = 0;
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => { alive = false; io.disconnect(); };
  }, [doc, index, width]);
  const rotated = rotation % 180 !== 0;
  const box = rotated ? { w: width, h: width / ratio } : { w: width, h: width * ratio };
  return (
    <div ref={ref} className={cn("relative flex items-center justify-center overflow-hidden rounded-sm bg-white shadow-sm ring-1 ring-border", className)} style={{ width: box.w, height: Math.max(box.h, 40) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" draggable={false} className="max-w-none transition-transform" style={{ width: rotated ? box.h : box.w, transform: `rotate(${rotation}deg)` }} />}
    </div>
  );
}

export function FileChip({ file, onRemove, pages }: { file: LoadedFile; onRemove?: () => void; pages?: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5">
      <FileText className="size-5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="text-xs text-ink-3">{formatBytes(file.size)}{pages ? ` · ${pages} page${pages > 1 ? "s" : ""}` : ""}</p>
      </div>
      {onRemove && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${file.name}`} onClick={onRemove}><X /></Button>}
    </div>
  );
}

export function Working({ label, progress, detail }: { label: string; progress?: number | null; detail?: string }) {
  const pct = progress == null ? null : Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div className="rounded-2xl border border-border bg-surface p-8 text-center" aria-live="polite">
      {pct !== null && <p className="font-display text-5xl tabular-nums tracking-tight" data-testid="progress-percent">{pct}%</p>}
      <p className="mt-2 mb-4 text-sm font-medium">{label}…</p>
      <Progress value={pct} className="mx-auto max-w-sm" />
      {detail && <p className="mt-3 text-xs text-ink-3">{detail}</p>}
    </div>
  );
}

export function ErrorCard({ message, onRetry, onReset }: { message: string; onRetry?: () => void; onReset: () => void }) {
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger-soft/50 p-6 text-center" role="alert">
      <AlertTriangle className="mx-auto mb-2 size-6 text-danger" />
      <p className="font-medium">Something went wrong while processing your document.</p>
      <p className="mt-1 text-sm text-ink-2">{message}</p>
      <div className="mt-4 flex justify-center gap-2">
        {onRetry && <Button onClick={onRetry}><RotateCcw /> Retry</Button>}
        <Button variant="outline" onClick={onReset}>Upload another file</Button>
      </div>
    </div>
  );
}

export function UnavailableCard({ tool, onReset }: { tool: Tool; onReset: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 text-center">
      <CloudOff className="mx-auto mb-2 size-6 text-ink-3" />
      <p className="font-medium">{tool.name} needs our processing service</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">This tool runs on secure cloud processing, which isn&apos;t connected in this environment. Browser-based tools like editing, merging and compression still work.</p>
      <Button variant="outline" className="mt-4" onClick={onReset}>Choose another file</Button>
    </div>
  );
}

export interface ToolResult {
  blob: Blob;
  name: string;
  /** Optional summary line, e.g. "8.4 MB → 2.1 MB · 75% smaller". */
  summary?: React.ReactNode;
  /** True if the result is a PDF that can be opened in the editor. */
  editable?: boolean;
}

export function ResultCard({ result, onReset, tool }: { result: ToolResult; onReset: () => void; tool: Tool }) {
  const router = useRouter();
  const ext = result.name.split(".").pop() ?? "pdf";
  const [name, setName] = useState(stripExtension(result.name));
  const download = () => {
    downloadBlob(result.blob, sanitizeFileName(name, ext));
    track("download_completed", { tool: tool.slug, format: ext });
  };
  const [opening, setOpening] = useState(false);
  const edit = async () => {
    setOpening(true);
    await handoff.put([{ name: sanitizeFileName(name, ext), type: "application/pdf", bytes: new Uint8Array(await result.blob.arrayBuffer()) }]);
    router.push("/editor");
  };
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm animate-pop" data-testid="tool-result">
      {opening && <LogoLoader overlay label="Opening the editor…" hint="Preparing your document" />}
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="text-lg font-semibold">Your file is ready</p>
          <p className="text-sm text-ink-3">{result.summary ?? formatBytes(result.blob.size)}</p>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-2">
        <PencilLine className="size-4 shrink-0 text-ink-3" />
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="File name" onKeyDown={(e) => e.key === "Enter" && download()} />
        <span className="text-sm text-ink-3">.{ext}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="lg" onClick={download} className="flex-1" data-testid="tool-download"><Download /> Download</Button>
        {result.editable && <Button size="lg" variant="outline" onClick={edit}>Open in editor <ArrowRight /></Button>}
      </div>
      <button onClick={onReset} className="mt-4 text-sm text-ink-3 hover:text-ink">Start over with another file</button>
    </div>
  );
}

/**
 * Password-protected and permission-restricted PDFs are unlocked here (in the
 * browser) so every tool can work on them. Pass `raw` to receive files untouched.
 */
export async function unlockFiles(files: LoadedFile[]): Promise<LoadedFile[]> {
  const out: LoadedFile[] = [];
  for (const f of files) {
    if (!/pdf/i.test(f.type) && !f.name.toLowerCase().endsWith(".pdf")) { out.push(f); continue; }
    const { bytes } = await ensureUnlocked(f.name, f.bytes);
    out.push(bytes === f.bytes ? f : { ...f, bytes, size: bytes.length });
  }
  return out;
}

export function Intake({ tool, onFiles, multiple, title, raw }: { tool: Tool; onFiles: (f: LoadedFile[]) => void; multiple?: boolean; title?: string; raw?: boolean }) {
  const accept = useCallback(async (fs: LoadedFile[]) => onFiles(raw ? fs : await unlockFiles(fs)), [onFiles, raw]);
  useHandoffFiles(accept);
  return <Dropzone accepts={tool.accepts} multiple={multiple ?? tool.multiple} onFiles={(fs) => accept(fs.map(toLoaded))} title={title} buttonLabel={multiple ?? tool.multiple ? "Choose files" : "Choose file"} tool={tool.slug} />;
}

export function pdfBlob(bytes: Uint8Array) {
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export function baseName(name: string) {
  return stripExtension(name);
}
