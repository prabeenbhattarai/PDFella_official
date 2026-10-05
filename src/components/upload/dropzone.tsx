"use client";

import { useCallback, useRef, useState } from "react";
import { FileUp, ShieldCheck, Zap, UserX, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/form";
import { cn, formatBytes } from "@/lib/utils";
import { sniffFile, kindLabel, type DetectedKind } from "@/lib/security/filetype";
import { limitsFor } from "@/lib/limits";
import { track, sizeBucket } from "@/lib/analytics";

export interface AcceptedFile {
  file: File;
  kind: DetectedKind;
  bytes: Uint8Array;
}

interface DropzoneProps {
  accepts: DetectedKind[];
  multiple?: boolean;
  onFiles: (files: AcceptedFile[]) => void | Promise<void>;
  size?: "hero" | "default" | "compact";
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  className?: string;
  tool?: string;
}

const ACCEPT_ATTR: Partial<Record<DetectedKind, string>> = {
  pdf: ".pdf,application/pdf",
  png: ".png,image/png",
  jpg: ".jpg,.jpeg,image/jpeg",
  webp: ".webp,image/webp",
  gif: ".gif,image/gif",
  docx: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: ".odt",
  txt: ".txt,text/plain",
};

/** Reads a file with progress (large files can take a moment to load into memory). */
function readWithProgress(file: File, onProgress: (pct: number) => void): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

export function Dropzone({ accepts, multiple, onFiles, size = "default", title, subtitle, buttonLabel = "Choose file", className, tool }: DropzoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<{ name: string; pct: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const limits = limitsFor();

  const handle = useCallback(async (list: FileList | File[]) => {
    setError(null);
    const files = Array.from(list).slice(0, multiple ? limits.maxFilesPerTask : 1);
    if (!files.length) return;
    const accepted: AcceptedFile[] = [];
    for (const file of files) {
      if (file.size === 0) { setError(`“${file.name}” is empty.`); return; }
      if (file.size > limits.maxFileBytes) { setError(`“${file.name}” is ${formatBytes(file.size)}. The limit is ${formatBytes(limits.maxFileBytes)} per file.`); return; }
      const kind = await sniffFile(file);
      if (!accepts.includes(kind)) {
        const want = [...new Set(accepts.map((k) => kindLabel[k]))].join(", ");
        setError(kind === "unknown"
          ? `We couldn't recognise “${file.name}”. Supported: ${want}.`
          : `“${file.name}” is a ${kindLabel[kind]} file. This tool accepts ${want}.`);
        track("error_occurred", { code: "unsupported_type", tool });
        return;
      }
      setBusy({ name: file.name, pct: 0 });
      try {
        const bytes = await readWithProgress(file, (pct) => setBusy({ name: file.name, pct }));
        accepted.push({ file, kind, bytes });
        track("file_uploaded", { tool, sizeBucket: sizeBucket(file.size), format: kind });
      } catch {
        setError(`We couldn't read “${file.name}”. Try again or choose another file.`);
        setBusy(null);
        return;
      }
    }
    try {
      await onFiles(accepted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong while opening your document.");
    } finally {
      setBusy(null);
    }
  }, [accepts, multiple, onFiles, limits, tool]);

  const acceptAttr = accepts.map((k) => ACCEPT_ATTR[k]).filter(Boolean).join(",");
  const formats = [...new Set(accepts.map((k) => kindLabel[k]))];
  const hero = size === "hero";

  return (
    <div className={className}>
      <div
        onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false); }}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) handle(e.dataTransfer.files); }}
        className={cn(
          "group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-all",
          hero ? "min-h-[280px] px-6 py-10 sm:min-h-[min(380px,42svh)]" : size === "compact" ? "min-h-[160px] px-5 py-6" : "min-h-[240px] px-6 py-10",
          drag ? "border-accent bg-accent-soft/60 scale-[1.01]" : "border-border-strong bg-surface hover:border-accent/60",
          busy && "pointer-events-none",
        )}
        data-testid="dropzone"
      >
        {busy ? (
          <div className="w-full max-w-xs space-y-3" aria-live="polite">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent"><FileUp className="size-6 animate-pulse" /></div>
            <p className="truncate text-sm font-medium">{busy.pct < 100 ? "Reading" : "Opening"} {busy.name}…</p>
            <Progress value={busy.pct < 100 ? busy.pct : null} />
          </div>
        ) : (
          <>
            <div className={cn("mb-4 flex items-center justify-center rounded-2xl bg-accent-soft text-accent transition-transform group-hover:-translate-y-0.5", hero ? "size-16" : "size-12")}>
              <FileUp className={hero ? "size-8" : "size-6"} strokeWidth={1.75} />
            </div>
            <p className={cn("font-semibold tracking-tight", hero ? "text-xl sm:text-2xl" : "text-lg")}>{title ?? (drag ? "Drop to open" : multiple ? "Drop your files here" : "Drop your document here")}</p>
            <p className="mt-1 text-sm font-medium text-ink-3">{subtitle ?? "or"}</p>
            <Button size={hero ? "lg" : "md"} className={cn("mt-4", hero && "px-8")} onClick={() => input.current?.click()}>
              <FileUp /> {buttonLabel}
            </Button>
            <p className="mt-4 text-[13px] font-medium text-ink-2">{formats.join(", ")} · up to {formatBytes(limits.maxFileBytes)}</p>
          </>
        )}
        <input
          ref={input}
          type="file"
          className="sr-only"
          accept={acceptAttr}
          multiple={multiple}
          onChange={(e) => { if (e.target.files) handle(e.target.files); e.target.value = ""; }}
          aria-label={buttonLabel}
          data-testid="file-input"
        />
      </div>
      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-left text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {hero && (
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-ink-2">
          <li className="flex items-center gap-1.5"><UserX className="size-4" /> No account required</li>
          <li className="flex items-center gap-1.5"><Zap className="size-4" /> Edits run in your browser</li>
          <li className="flex items-center gap-1.5"><ShieldCheck className="size-4" /> Private by default</li>
        </ul>
      )}
    </div>
  );
}
