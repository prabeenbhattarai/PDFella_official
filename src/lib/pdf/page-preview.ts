/**
 * On-screen preview of a page with edited text really removed.
 *
 * When text is edited, the original glyphs are deleted from the page's content
 * stream on export (no box is painted over them). The preview does the same on a
 * one-page copy, so watermarks, tints and images under the text stay visible
 * exactly as in the saved file. Edits whose text can't be removed safely keep the
 * cover box, as on export.
 */
import { PDFDocument, type PDFPage } from "pdf-lib";
import type { PDFPageProxy } from "pdfjs-dist";
import type { EditorObject, PageRef } from "../editor/model";
import { removeTextRuns, type RemovalTarget } from "./content-edit";
import { openPdf } from "./pdfjs";

export interface EditedPage {
  page: PDFPageProxy;
  /** Ids of objects (edited text, text-only whiteouts) whose original glyphs are gone. */
  removed: Set<string>;
}

/** Original text an object deletes from the page: edited lines and text-only whiteouts. */
export interface TextRemoval { id: string; runs: RemovalTarget[] }

const sourceDocs = new Map<string, Promise<PDFDocument>>();
const cache = new Map<string, Promise<EditedPage | null>>();
const MAX_CACHED = 12;

/** Everything on a page that deletes original text (shared by the preview and export). */
export function textRemovals(objects: EditorObject[] | undefined): TextRemoval[] {
  const out: TextRemoval[] = [];
  for (const o of objects ?? []) {
    if (o.kind === "textEdit" && o.strategy === "remove") {
      const runs = o.original.pdfRuns?.length ? o.original.pdfRuns : o.original.pdf ? [o.original.pdf] : [];
      if (runs.length) out.push({ id: o.id, runs });
    } else if (o.kind === "whiteout" && o.mode === "text" && o.runs?.length) {
      out.push({ id: o.id, runs: o.runs });
    }
  }
  return out;
}

/** Cache key: which runs are removed (typing doesn't change it, so it doesn't re-render). */
export function editsKey(edits: TextRemoval[]): string {
  return edits.map((e) => `${e.id}:${e.runs.map((r) => `${r.x.toFixed(1)},${r.y.toFixed(1)}`).join(";")}`).sort().join("|");
}

/** Delete the runs from a pdf-lib page; returns the ids whose runs were all removed. */
export function applyTextRemovals(doc: PDFDocument, page: PDFPage, edits: TextRemoval[]): Set<string> {
  const removed = new Set<string>();
  if (!edits.length) return removed;
  const ok = removeTextRuns(doc, page, edits.flatMap((e) => e.runs));
  let k = 0;
  // An object counts as removed only if every one of its runs was removed; otherwise it is covered.
  for (const e of edits) if (e.runs.map(() => ok[k++]).every(Boolean)) removed.add(e.id);
  return removed;
}

export function getEditedPage(ref: PageRef, sourceBytes: Uint8Array, edits: TextRemoval[]): Promise<EditedPage | null> {
  if (!ref.sourceId || !edits.length) return Promise.resolve(null);
  const key = `${ref.sourceId}:${ref.sourceIndex}:${editsKey(edits)}`;
  let p = cache.get(key);
  if (!p) {
    p = build(ref, sourceBytes, edits).catch(() => null);
    cache.set(key, p);
    if (cache.size > MAX_CACHED) {
      const [oldKey, old] = cache.entries().next().value!;
      cache.delete(oldKey);
      void old.then((e) => e?.page.cleanup());
    }
  }
  return p;
}

async function build(ref: PageRef, bytes: Uint8Array, edits: TextRemoval[]): Promise<EditedPage | null> {
  let src = sourceDocs.get(ref.sourceId!);
  if (!src) {
    src = PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
    sourceDocs.set(ref.sourceId!, src);
  }
  const doc = await PDFDocument.create();
  const [copy] = await doc.copyPages(await src, [ref.sourceIndex]);
  const page = doc.addPage(copy);
  const removed = applyTextRemovals(doc, page, edits);
  if (!removed.size) return null;
  const pdf = await openPdf(await doc.save({ useObjectStreams: false }));
  return { page: await pdf.getPage(1), removed };
}
