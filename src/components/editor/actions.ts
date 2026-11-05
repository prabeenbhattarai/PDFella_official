"use client";

import { useEditor } from "@/lib/editor/store";
import { displaySize } from "@/lib/editor/model";
import { exportDocument, EncryptedPdfError, type RedactionRegion } from "@/lib/pdf/export";
import { isProcessingAvailable, runJob } from "@/lib/processing/client";
import { downloadBlob, sanitizeFileName } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { saveTemplate } from "@/lib/templates";
import { requirePlan } from "@/lib/plans";
import { cropPdf, readBookmarks, writeBookmarks, type Bookmark, type CropMargins } from "@/lib/pdf/document-info";
import { getDoc } from "@/lib/pdf/docCache";
import { createSource } from "@/lib/editor/load";
import { toast } from "@/components/ui/toast";

async function serverRedact(pdf: Uint8Array, regions: RedactionRegion[]): Promise<Uint8Array | null> {
  if (!(await isProcessingAvailable())) return null;
  const { blob } = await runJob("redact", [{ name: "document.pdf", blob: new Blob([pdf as BlobPart], { type: "application/pdf" }) }], { params: { regions } });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Combine all layers into the final PDF bytes. */
/**
 * Combine all layers into the final PDF bytes. Everything happens on-device unless
 * the user explicitly opts in to server-side redaction (which keeps text selectable).
 */
export async function buildPdf(opts: { flattenForms?: boolean; serverRedaction?: boolean; onProgress?: (l: string) => void } = {}): Promise<Uint8Array> {
  const s = useEditor.getState();
  const bytes = await exportDocument(
    { docName: s.docName, sources: s.sources, pages: s.pages, objects: s.objects, assets: s.assets, formValues: s.formValues },
    { flattenForms: opts.flattenForms, serverRedact: opts.serverRedaction ? serverRedact : undefined, onProgress: opts.onProgress },
  );
  if (!s.bookmarks) return bytes;
  return writeBookmarks(bytes, await currentBookmarks());
}

/** The editor's bookmarks, as a list that points at pages by position. */
export async function currentBookmarks(): Promise<Bookmark[]> {
  const s = useEditor.getState();
  if (s.bookmarks) {
    return s.bookmarks.flatMap(({ pageId, ...b }) => {
      const page = s.pages.findIndex((p) => p.id === pageId);
      return page >= 0 || b.url ? [{ ...b, page: Math.max(page, 0) }] : [];
    });
  }
  // Nothing edited yet: start from the outlines of the document's files, in page order.
  const out: Bookmark[] = [];
  for (const sourceId of new Set(s.pages.map((p) => p.sourceId).filter(Boolean) as string[])) {
    for (const b of await readBookmarks(await getDoc(sourceId)).catch(() => [] as Bookmark[])) {
      const page = s.pages.findIndex((p) => p.sourceId === sourceId && p.sourceIndex === b.page);
      if (page >= 0 || b.url) out.push({ ...b, page: Math.max(page, 0) });
    }
  }
  return out;
}

export function saveBookmarks(list: Bookmark[]) {
  const s = useEditor.getState();
  s.setBookmarks(list.map(({ page, ...b }) => ({ ...b, pageId: b.url ? null : s.pages[page]?.id ?? null })));
}

/** Crop by rebuilding the document with its edits included. Undo brings the previous version back. */
export async function cropDocument(bytes: Uint8Array, margins: CropMargins, pages: "all" | number[]) {
  const { source, pages: refs } = await createSource(useEditor.getState().docName, await cropPdf(bytes, margins, pages));
  useEditor.getState().replaceDocument(source, refs);
}

export function friendlyError(e: unknown): string {
  if (e instanceof EncryptedPdfError) return e.message;
  return "Something went wrong while processing your document. Please try again.";
}

/** Keep the document as it is now as a reusable template, stored in this browser. */
export async function saveAsTemplate() {
  if (!requirePlan("templates", () => void saveAsTemplate())) return;
  const s = useEditor.getState();
  try {
    const saved = await saveTemplate(s.docName, await buildPdf());
    if (saved) toast.success("Saved as a template", "Find it on the PDF Templates page.");
    else toast.error("Couldn't save the template", "Your browser's storage may be full or blocked.");
  } catch (e) {
    toast.error("Couldn't save the template", friendlyError(e));
  }
}

export async function downloadNow() {
  const s = useEditor.getState();
  try {
    const bytes = await buildPdf();
    downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), sanitizeFileName(s.docName));
    track("download_completed", { pages: s.pages.length });
    s.markSaved();
  } catch (e) {
    console.error(e);
    toast.error("Download failed", friendlyError(e));
  }
}

export async function printDocument() {
  try {
    const bytes = await buildPdf();
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.src = url;
    frame.onload = () => {
      try { frame.contentWindow?.focus(); frame.contentWindow?.print(); }
      catch { window.open(url, "_blank", "noopener"); }
      setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60_000);
    };
    document.body.appendChild(frame);
  } catch (e) {
    toast.error("Couldn't prepare the document for printing", friendlyError(e));
  }
}

/** Read an image file into a PNG/JPEG data URL (other formats transcoded) and its pixel size. */
export async function readImage(file: Blob): Promise<{ url: string; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const keep = file.type === "image/png" || file.type === "image/jpeg";
  let url: string;
  const maxDim = 2400;
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  if (keep && scale === 1) {
    url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
  } else {
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    url = file.type === "image/jpeg" ? c.toDataURL("image/jpeg", 0.9) : c.toDataURL("image/png");
  }
  const out = { url, width: bmp.width * scale, height: bmp.height * scale };
  bmp.close();
  return out;
}

/** Prepare an asset for click-to-place, sized sensibly for the current page. */
export function armAsset(url: string, width: number, height: number, kind: "image" | "signature") {
  const s = useEditor.getState();
  const page = s.pages[s.currentPage] ?? s.pages[0];
  const { w: pw } = page ? displaySize(page) : { w: 595 };
  const target = kind === "signature" ? Math.min(180, pw * 0.3) : Math.min(width * 0.75, pw * 0.45);
  const scale = target / width;
  const asset = s.addAsset(url);
  s.setPendingAsset({ asset, kind, w: width * scale, h: height * scale });
  toast.info(kind === "signature" ? "Click on the page to place your signature" : "Click on the page to place the image");
  return asset;
}
