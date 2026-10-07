"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FilePlus2, Minimize2, PencilLine, Share2, Image as ImageIcon, FileType } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Progress, Switch } from "@/components/ui/form";
import { useEditor } from "@/lib/editor/store";
import { downloadBlob, formatBytes, sanitizeFileName, stripExtension } from "@/lib/utils";
import { pdfToImages, pdfToText } from "@/lib/pdf/ops";
import { handoff } from "@/lib/storage/local";
import { track } from "@/lib/analytics";
import { toast } from "@/components/ui/toast";
import { buildPdf, friendlyError } from "./actions";
import { isProcessingAvailable } from "@/lib/processing/client";

type Phase = { kind: "options" } | { kind: "working"; label: string } | { kind: "done"; bytes: Uint8Array } | { kind: "error"; message: string };

export function SaveDialog({ open, onClose, onNew }: { open: boolean; onClose: () => void; onNew: () => void }) {
  const router = useRouter();
  const docName = useEditor((s) => s.docName);
  const hasForm = useEditor((s) => Object.values(s.sources).some((x) => x.hasForm) || Object.values(s.objects).flat().some((o) => o.kind === "field"));
  const hasRedactions = useEditor((s) => Object.values(s.objects).flat().some((o) => o.kind === "redact"));
  const [cloudAvailable, setCloudAvailable] = useState(false);
  const [serverRedaction, setServerRedaction] = useState(false);
  useEffect(() => { if (hasRedactions) isProcessingAvailable().then(setCloudAvailable); }, [hasRedactions]);
  const [name, setName] = useState(stripExtension(docName));
  const [flatten, setFlatten] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "options" });
  const [extra, setExtra] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(stripExtension(docName));
    setPhase({ kind: "options" });
    // Go straight to building unless there are options to choose.
    if (!hasForm && !hasRedactions) run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = async (flat: boolean) => {
    setPhase({ kind: "working", label: "Preparing" });
    try {
      track("edit_completed", { pages: useEditor.getState().pages.length });
      const bytes = await buildPdf({ flattenForms: flat, serverRedaction, onProgress: (label) => setPhase({ kind: "working", label }) });
      setPhase({ kind: "done", bytes });
      useEditor.getState().markSaved();
    } catch (e) {
      console.error(e);
      track("error_occurred", { code: "export_failed" });
      setPhase({ kind: "error", message: friendlyError(e) });
    }
  };

  const fileName = sanitizeFileName(name || "document");
  const blob = useMemo(() => (phase.kind === "done" ? new Blob([phase.bytes as BlobPart], { type: "application/pdf" }) : null), [phase]);

  const download = () => {
    if (!blob) return;
    downloadBlob(blob, fileName);
    useEditor.getState().setDocName(fileName);
    track("download_completed", { format: "pdf" });
  };

  const downloadAs = async (format: "png" | "jpg" | "txt") => {
    if (phase.kind !== "done") return;
    setExtra(format);
    try {
      if (format === "txt") {
        const text = await pdfToText(phase.bytes);
        downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), sanitizeFileName(name, "txt"));
      } else {
        const out = await pdfToImages(phase.bytes, format, 150, "all", stripExtension(fileName));
        downloadBlob(out.blob, out.name);
      }
      track("download_completed", { format });
    } catch {
      toast.error("Export failed", "We couldn't create that format. Please try again.");
    } finally {
      setExtra(null);
    }
  };

  const share = async () => {
    if (!blob) return;
    const file = new File([blob], fileName, { type: "application/pdf" });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: fileName });
      else toast.info("Sharing isn't supported in this browser", "Download the file and share it from your device.");
    } catch { /* user cancelled */ }
  };

  const compress = async () => {
    if (phase.kind !== "done") return;
    await handoff.put([{ name: fileName, type: "application/pdf", bytes: phase.bytes }]);
    router.push("/compress-pdf?from=editor");
  };

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <Dialog open={open} onClose={onClose} title={phase.kind === "done" ? "Your document is ready" : phase.kind === "error" ? "Couldn't save your document" : "Save changes"} size="md" dismissable={phase.kind !== "working"}>
      {phase.kind === "options" && (
        <div className="space-y-4">
          {hasForm && <Switch label="Flatten form fields (make them non-editable)" checked={flatten} onChange={setFlatten} />}
          {hasRedactions && (
            <div className="space-y-2 rounded-xl bg-surface-2 p-3.5 text-[13px]">
              <p className="font-medium">Redactions will be applied permanently.</p>
              <p className="text-ink-3">On your device, pages with redactions are rebuilt as images with a searchable text layer for everything that isn&apos;t redacted.</p>
              {cloudAvailable && <Switch label="Use secure cloud redaction instead (keeps pages as vector text; uploads this document temporarily)" checked={serverRedaction} onChange={setServerRedaction} />}
            </div>
          )}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => run(flatten)}>Save</Button></div>
        </div>
      )}
      {phase.kind === "working" && (
        <div className="space-y-3 py-6 text-center" aria-live="polite">
          <p className="text-sm text-ink-2">{phase.label}…</p>
          <Progress value={null} />
        </div>
      )}
      {phase.kind === "error" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">{phase.message}</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Back to editor</Button><Button onClick={() => run(flatten)}>Try again</Button></div>
        </div>
      )}
      {phase.kind === "done" && (
        <div className="space-y-5" data-testid="save-ready">
          <div className="flex items-center gap-3 rounded-xl bg-accent-soft p-3.5">
            <CheckCircle2 className="size-6 shrink-0 text-accent" />
            <div className="min-w-0 text-sm">
              <p className="font-medium">All changes applied</p>
              <p className="text-ink-3">{useEditor.getState().pages.length} page{useEditor.getState().pages.length === 1 ? "" : "s"} · {formatBytes(phase.bytes.length)}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="file-name" className="flex items-center gap-1.5 text-xs font-medium text-ink-2"><PencilLine className="size-3.5" /> File name</label>
            <div className="flex items-center gap-2">
              <Input id="file-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && download()} data-autofocus />
              <span className="text-sm text-ink-3">.pdf</span>
            </div>
          </div>
          <Button size="lg" className="w-full" onClick={download} data-testid="download-pdf"><Download /> Download PDF</Button>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadAs("png")} disabled={!!extra}><ImageIcon /> {extra === "png" ? "…" : "PNG"}</Button>
            <Button variant="outline" size="sm" onClick={() => downloadAs("jpg")} disabled={!!extra}><ImageIcon /> {extra === "jpg" ? "…" : "JPG"}</Button>
            <Button variant="outline" size="sm" onClick={() => downloadAs("txt")} disabled={!!extra}><FileType /> {extra === "txt" ? "…" : "Text"}</Button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button variant="secondary" size="sm" onClick={onClose}><PencilLine /> Continue editing</Button>
            <Button variant="ghost" size="sm" onClick={compress}><Minimize2 /> Compress</Button>
            {canShare && <Button variant="ghost" size="sm" onClick={share}><Share2 /> Share</Button>}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={onNew}><FilePlus2 /> New document</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
