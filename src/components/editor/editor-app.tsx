"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FilePlus2, History, AlertTriangle, RotateCcw, Upload, LifeBuoy, PenLine, Plus } from "lucide-react";
import { useEditor, type ToolId } from "@/lib/editor/store";
import { useSearch } from "@/lib/editor/search";
import { openInEditor, newBlankDocument, writeAutosave, readAutosaveMeta, restoreAutosave, clearAutosave, replaceSourceBytes, type InputFile } from "@/lib/editor/load";
import { PasswordRequiredError, openPdf } from "@/lib/pdf/pdfjs";
import { PasswordCancelledError } from "@/lib/pdf/unlock";
import { handoff } from "@/lib/storage/local";
import { runJob, ProcessingUnavailableError } from "@/lib/processing/client";
import { track } from "@/lib/analytics";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Dropzone, type AcceptedFile } from "@/components/upload/dropzone";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { LogoLoader } from "@/components/ui/logo-loader";
import { toast } from "@/components/ui/toast";
import { TopBar } from "./top-bar";
import { ToolRail } from "./tool-rail";
import { Thumbnails } from "./thumbnails";
import { DocumentCanvas } from "./canvas";
import { PropertiesPanel } from "./properties-panel";
import { SignatureDialog } from "./signature-dialog";
import { SaveDialog } from "./save-dialog";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { SearchBar } from "./search-bar";
import { TOOL_DEFS } from "./tools";
import { ToolHint } from "./tool-hint";
import { armAsset, buildPdf, printDocument, readImage } from "./actions";
import { getEditedPage, removableEdits } from "@/lib/pdf/page-preview";

const ACCEPT = ["pdf", "png", "jpg", "webp", "docx", "xlsx", "pptx", "odt", "txt"] as const;

export function EditorApp() {
  const params = useSearchParams();
  const status = useEditor((s) => s.status);
  const error = useEditor((s) => s.error);
  const pages = useEditor((s) => s.pages.length);
  const selection = useEditor((s) => s.selection);
  const editingId = useEditor((s) => s.editingId);
  const tool = useEditor((s) => s.tool);
  const signatures = useEditor((s) => s.signatures);
  const assets = useEditor((s) => s.assets);
  const searchOpen = useSearch((s) => s.open);
  const [restore, setRestore] = useState<{ docName: string; savedAt: number; pages: number } | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [showThumbs, setShowThumbs] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const [mobileThumbs, setMobileThumbs] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const openInput = useRef<HTMLInputElement>(null);
  const booted = useRef(false);
  // True until we know whether a file was handed over, so the empty state never flashes.
  const [booting, setBooting] = useState(true);

  const applyQuery = useCallback(() => {
    const t = params.get("tool") as ToolId | null;
    if (t && TOOL_DEFS[t]) {
      if (t === "signature") setSigOpen(true);
      else if (t === "image") setTimeout(() => imageInput.current?.click(), 300);
      else useEditor.getState().setTool(t);
    }
  }, [params]);

  const open = useCallback(async (files: InputFile[]) => {
    try {
      await openInEditor(files);
      track("edit_started", { pages: useEditor.getState().pages.length, tool: params.get("tool") ?? "editor" });
      applyQuery();
    } catch (e) {
      if (e instanceof PasswordCancelledError || e instanceof PasswordRequiredError) {
        useEditor.getState().setStatus("empty");
        toast.info("The document wasn't opened", "Enter its password to unlock and edit it.");
        return;
      }
      console.error(e);
      track("error_occurred", { code: e instanceof ProcessingUnavailableError ? "processing_unavailable" : "open_failed" });
      useEditor.getState().setStatus("error", e instanceof ProcessingUnavailableError
        ? "Converting Office documents needs the processing service, which isn't available right now. Convert the file to PDF first, or try again later."
        : e instanceof Error && /isn't a file type/.test(e.message) ? e.message
          : "We couldn't open this document. It may be damaged or use features we don't support yet.");
    }
  }, [applyQuery, params]);

  // Boot: hand-off from landing page → otherwise offer to restore an auto-save.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      try {
        const files = await handoff.take();
        if (files?.length) return await open(files);
        if (useEditor.getState().status === "ready") return;
        const meta = await readAutosaveMeta();
        if (meta) setRestore(meta);
      } finally {
        setBooting(false);
      }
    })();
  }, [open]);

  // Auto-save locally (debounced) and warn before leaving with unsaved changes.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.pages !== prev.pages || s.objects !== prev.objects || s.docName !== prev.docName) {
        clearTimeout(t);
        t = setTimeout(() => writeAutosave(), 1200);
      }
    });
    const warn = (e: BeforeUnloadEvent) => { if (useEditor.getState().dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { unsub(); clearTimeout(t); window.removeEventListener("beforeunload", warn); };
  }, []);

  const pickTool = useCallback((t: ToolId) => {
    const s = useEditor.getState();
    s.setPendingAsset(null);
    if (t === "image") { imageInput.current?.click(); return; }
    if (t === "signature") {
      if (s.signatures.length) { s.setTool("signature"); return; }
      setSigOpen(true);
      return;
    }
    s.setTool(t);
  }, []);

  const onImage = async (f: File | undefined) => {
    if (!f) return;
    try {
      const img = await readImage(f);
      armAsset(img.url, img.width, img.height, "image");
    } catch {
      toast.error("Couldn't read that image", "Use a PNG, JPG or WEBP file.");
    }
  };

  const runOcr = useCallback(async () => {
    const s = useEditor.getState();
    const src = Object.values(s.sources).find((x) => x.scanned) ?? Object.values(s.sources)[0];
    if (!src) return;
    const id = "ocr";
    toast.info("Running OCR…", "This can take a minute for long documents.");
    try {
      track("conversion_started", { tool: "ocr" });
      const { blob } = await runJob("ocr", [{ name: src.name, blob: new Blob([src.bytes as BlobPart], { type: "application/pdf" }) }], { params: { language: "eng" } });
      await replaceSourceBytes(src.id, new Uint8Array(await blob.arrayBuffer()));
      track("conversion_completed", { tool: "ocr" });
      toast.success("Text recognised", "The document is now searchable and its text can be edited.");
    } catch (e) {
      toast.error(e instanceof ProcessingUnavailableError ? "OCR isn't available right now" : "OCR failed",
        e instanceof ProcessingUnavailableError ? "OCR runs on our processing service, which isn't connected in this environment." : "Something went wrong while processing your document.");
    }
    void id;
  }, []);

  const startNew = useCallback(async () => {
    setSaveOpen(false);
    if (useEditor.getState().dirty && !confirm("Start a new document? Unsaved changes will be lost.")) return;
    await clearAutosave();
    useEditor.getState().reset();
    useSearch.getState().setOpen(false);
  }, []);

  // Dev/test hook (never shipped to production): lets Playwright inspect exported bytes.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as Record<string, unknown>).__pdfella = { store: useEditor, buildPdf, openPdf, getEditedPage, removableEdits };
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useEditor.getState();
      if (s.status !== "ready") return;
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "s") { e.preventDefault(); setSaveOpen(true); return; }
      if (mod && k === "p") { e.preventDefault(); printDocument(); return; }
      if (mod && k === "f") { e.preventDefault(); useSearch.getState().setOpen(true); return; }
      if (typing) return;
      if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return; }
      if (mod && k === "y") { e.preventDefault(); s.redo(); return; }
      if (mod && k === "c") { s.copy(); return; }
      if (mod && k === "v") { const p = s.pages[s.currentPage]; if (p) s.paste(p.id); return; }
      if (mod && k === "d") { e.preventDefault(); s.duplicateObjects(s.selection); return; }
      if (mod && (k === "=" || k === "+")) { e.preventDefault(); s.setZoom(s.zoom * 1.2); return; }
      if (mod && k === "-") { e.preventDefault(); s.setZoom(s.zoom / 1.2); return; }
      if (mod && k === "0") { e.preventDefault(); s.setZoom(s.zoom, "width"); return; }
      if (mod && k === "a") { e.preventDefault(); const p = s.pages[s.currentPage]; if (p) s.select((s.objects[p.id] ?? []).map((o) => o.id)); return; }
      if ((k === "delete" || k === "backspace") && s.selection.length) { e.preventDefault(); s.removeObjects(s.selection); return; }
      if (k === "escape") { if (s.pendingAsset) s.setPendingAsset(null); else if (s.selection.length) s.select([]); else s.setTool("select"); return; }
      if (k === "enter" && s.selection.length === 1) {
        const o = Object.values(s.objects).flat().find((x) => x.id === s.selection[0]);
        if (o && (o.kind === "text" || o.kind === "textEdit")) { e.preventDefault(); s.setEditing(o.id); }
        return;
      }
      if (k.startsWith("arrow") && s.selection.length) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const [dx, dy] = k === "arrowleft" ? [-d, 0] : k === "arrowright" ? [d, 0] : k === "arrowup" ? [0, -d] : [0, d];
        s.commit();
        for (const id of s.selection) {
          const o = Object.values(useEditor.getState().objects).flat().find((x) => x.id === id);
          if (!o) continue;
          const patch: Record<string, number> = { x: o.x + dx, y: o.y + dy };
          if (o.kind === "line" || o.kind === "arrow") Object.assign(patch, { x1: o.x1 + dx, x2: o.x2 + dx, y1: o.y1 + dy, y2: o.y2 + dy });
          s.updateObject(id, patch);
        }
        return;
      }
      if (e.key === "?") { setKeysOpen(true); return; }
      if (!mod && !e.altKey) {
        const def = Object.values(TOOL_DEFS).find((t) => t.key === k);
        if (def) pickTool(def.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickTool]);

  const onDropFiles = (files: AcceptedFile[]) => open(files.map((f) => ({ name: f.file.name, type: f.file.type, bytes: f.bytes })));

  // ───────────── empty / loading / error states
  if (status !== "ready" && (booting || status === "loading")) {
    return <LogoLoader label={booting && status !== "loading" ? "Loading the editor…" : "Opening your document…"} hint="Large or scanned files can take a few seconds" />;
  }
  if (status !== "ready") {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <header className="flex h-14 items-center border-b border-border bg-surface px-4"><Link href="/" aria-label="Home"><Logo /></Link></header>
        <main id="main" className="flex flex-1 items-center justify-center p-4">
          {status === "error" ? (
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-sm" role="alert">
              <AlertTriangle className="mx-auto mb-3 size-8 text-danger" />
              <h1 className="text-lg font-semibold">Something went wrong while processing your document.</h1>
              <p className="mt-2 text-sm text-ink-3">{error}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button onClick={() => useEditor.getState().reset()}><Upload /> Upload another file</Button>
                <Button variant="ghost" onClick={() => location.reload()}><RotateCcw /> Retry</Button>
                <a href={`mailto:${brand.supportEmail}`} className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm text-ink-2 hover:bg-surface-2"><LifeBuoy className="size-4" /> Contact support</a>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-2xl space-y-4">
              <div className="text-center">
                <h1 className="font-display text-4xl tracking-tight">Open a document to start editing</h1>
                <p className="mt-2 text-ink-3">PDFs and images stay in your browser. Word, Excel and PowerPoint files are converted to PDF on our secure server first.</p>
              </div>
              {restore && (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-4" role="status">
                  <History className="size-5 text-accent" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">Restore your previous document?</p>
                    <p className="truncate text-ink-3">{restore.docName} · {restore.pages} page{restore.pages === 1 ? "" : "s"} · {new Date(restore.savedAt).toLocaleString()}</p>
                  </div>
                  <Button size="sm" onClick={async () => { setRestore(null); await restoreAutosave(); applyQuery(); }}>Restore</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { setRestore(null); await clearAutosave(); }}>Discard</Button>
                </div>
              )}
              <Dropzone accepts={[...ACCEPT]} multiple onFiles={onDropFiles} size="hero" buttonLabel="Choose file" tool="editor" />
              <div className="text-center">
                <Button variant="ghost" onClick={async () => { await newBlankDocument(); applyQuery(); }}><FilePlus2 /> Start with a blank page</Button>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // While text is being edited on a phone, the text sheet replaces the properties sheet.
  const mobileSheet = !editingId && (selection.length > 0 || (tool !== "select" && tool !== "hand"));

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg" data-testid="editor">
      <TopBar
        onSave={() => setSaveOpen(true)}
        onNew={startNew}
        onOpen={() => openInput.current?.click()}
        onShortcuts={() => setKeysOpen(true)}
        showThumbs={showThumbs}
        showPanel={showPanel}
        toggleThumbs={() => setShowThumbs((v) => !v)}
        togglePanel={() => setShowPanel((v) => !v)}
      />
      <div className="flex min-h-0 flex-1">
        {showThumbs && <aside className="hidden w-[168px] shrink-0 border-r border-border bg-surface md:block" aria-label="Pages">{<Thumbnails />}</aside>}
        <nav className="hidden w-[76px] shrink-0 flex-col items-center overflow-y-auto border-r border-border bg-surface md:flex" aria-label="Tools"><ToolRail onPick={pickTool} orientation="vertical" /></nav>
        <main id="main" className="relative min-w-0 flex-1">
          {pages > 0 && <DocumentCanvas />}
          {searchOpen && <SearchBar onOcr={runOcr} />}
          <ToolHint />
          <PendingHint />
        </main>
        {showPanel && (
          <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-border bg-surface lg:block" aria-label="Properties">
            {tool === "signature" && selection.length === 0 && <SignaturePicker signatures={signatures} assets={assets} onNew={() => setSigOpen(true)} />}
            <PropertiesPanel onOcr={runOcr} />
          </aside>
        )}
      </div>

      {/* Mobile: properties bottom sheet + bottom toolbar + pages drawer */}
      {mobileSheet && (
        <div className="max-h-[40vh] overflow-y-auto border-t border-border bg-surface lg:hidden" aria-label="Properties">
          {tool === "signature" && selection.length === 0 && <SignaturePicker signatures={signatures} assets={assets} onNew={() => setSigOpen(true)} />}
          <PropertiesPanel onOcr={runOcr} />
        </div>
      )}
      <div className="flex items-center border-t border-border bg-surface md:hidden">
        <button className="flex h-[58px] shrink-0 flex-col items-center justify-center border-r border-border px-3 text-xs font-semibold" onClick={() => setMobileThumbs(true)} aria-label="Pages">{useEditor.getState().currentPage + 1}/{pages}<span className="text-[10px] font-medium text-ink-3">Pages</span></button>
        <div className="min-w-0 flex-1"><ToolRail onPick={pickTool} orientation="horizontal" /></div>
      </div>
      <div className={cn("fixed inset-0 z-50 md:hidden", mobileThumbs ? "block" : "hidden")}>
        <div className="absolute inset-0 bg-black/40" onClick={() => setMobileThumbs(false)} />
        <div className="absolute inset-y-0 left-0 w-[200px] bg-surface shadow-lg" onClick={(e) => { if ((e.target as HTMLElement).closest('[role="option"]')) setMobileThumbs(false); }}><Thumbnails /></div>
      </div>

      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => { onImage(e.target.files?.[0]); e.target.value = ""; }} aria-label="Choose image" />
      <input ref={openInput} type="file" accept=".pdf,image/*,.docx,.xlsx,.pptx,.odt,.txt" className="sr-only" onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        if (useEditor.getState().dirty && !confirm("Open another file? Unsaved changes will be lost.")) return;
        open([{ name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }]);
      }} aria-label="Open file" />

      <SignatureDialog open={sigOpen} onClose={() => setSigOpen(false)} onCreate={({ url, width, height }) => {
        const asset = armAsset(url, width, height, "signature");
        useEditor.getState().addSignature(asset);
      }} />
      <SaveDialog open={saveOpen} onClose={() => setSaveOpen(false)} onNew={startNew} />
      <ShortcutsDialog open={keysOpen} onClose={() => setKeysOpen(false)} />
    </div>
  );
}

function SignaturePicker({ signatures, assets, onNew }: { signatures: string[]; assets: Record<string, string>; onNew: () => void }) {
  const place = (asset: string) => {
    const img = new Image();
    img.onload = () => {
      const s = useEditor.getState();
      const w = 180, h = (180 * img.naturalHeight) / img.naturalWidth;
      s.setPendingAsset({ asset, kind: "signature", w, h });
    };
    img.src = assets[asset];
  };
  return (
    <section className="space-y-3 border-b border-border px-4 py-4">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase"><PenLine className="size-3.5" /> Your signatures</h3>
      <p className="text-[13px] text-ink-3">Choose one, then click on the page.</p>
      <div className="grid grid-cols-2 gap-2">
        {signatures.map((a) => (
          <button key={a} onClick={() => place(a)} className="flex h-16 items-center justify-center rounded-lg border border-border bg-white p-2 hover:border-accent dark:bg-[#f4f4f1]" aria-label="Place this signature">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assets[a]} alt="" className="max-h-full max-w-full object-contain" />
          </button>
        ))}
        <button onClick={onNew} className="flex h-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong text-xs text-ink-3 hover:border-accent hover:text-accent"><Plus className="size-4" /> New</button>
      </div>
    </section>
  );
}

function PendingHint() {
  const pending = useEditor((s) => s.pendingAsset);
  if (!pending) return null;
  return (
    <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-ink px-4 py-1.5 text-[13px] text-bg shadow-lg" role="status">
      Click on a page to place the {pending.kind} · Esc to cancel
    </div>
  );
}
