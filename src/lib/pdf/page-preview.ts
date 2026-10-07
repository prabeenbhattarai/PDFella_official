/**
 * On-screen preview of a page with edited text really removed.
 *
 * When text is edited, the original glyphs are deleted from the page's content
 * stream on export (no box is painted over them). The preview does the same on a
 * one-page copy, so watermarks, tints and images under the text stay visible
 * exactly as in the saved file. Edits whose text can't be removed safely keep the
 * cover box, as on export.
 */
import { PDFDocument } from "pdf-lib";
import type { PDFPageProxy } from "pdfjs-dist";
import type { EditorObject, PageRef, TextEditObject } from "../editor/model";
import { removeTextRuns, type RemovalTarget } from "./content-edit";
import { openPdf } from "./pdfjs";

export interface EditedPage {
  page: PDFPageProxy;
  /** textEdit ids whose original glyphs are gone from this preview. */
  removed: Set<string>;
}

const sourceDocs = new Map<string, Promise<PDFDocument>>();
const cache = new Map<string, Promise<EditedPage | null>>();
const MAX_CACHED = 12;

const runsOf = (e: TextEditObject): RemovalTarget[] => (e.original.pdfRuns?.length ? e.original.pdfRuns : e.original.pdf ? [e.original.pdf] : []);

/** textEdits on a page whose originals should be deleted. */
export function removableEdits(objects: EditorObject[] | undefined): TextEditObject[] {
  return (objects ?? []).filter((o): o is TextEditObject => o.kind === "textEdit" && o.strategy === "remove" && runsOf(o).length > 0);
}

/** Cache key: which runs are removed (typing doesn't change it, so it doesn't re-render). */
export function editsKey(edits: TextEditObject[]): string {
  return edits.map((e) => `${e.id}:${runsOf(e).map((r) => `${r.x.toFixed(1)},${r.y.toFixed(1)}`).join(";")}`).sort().join("|");
}

export function getEditedPage(ref: PageRef, sourceBytes: Uint8Array, edits: TextEditObject[]): Promise<EditedPage | null> {
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

async function build(ref: PageRef, bytes: Uint8Array, edits: TextEditObject[]): Promise<EditedPage | null> {
  let src = sourceDocs.get(ref.sourceId!);
  if (!src) {
    src = PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
    sourceDocs.set(ref.sourceId!, src);
  }
  const doc = await PDFDocument.create();
  const [copy] = await doc.copyPages(await src, [ref.sourceIndex]);
  const page = doc.addPage(copy);
  const groups = edits.map(runsOf);
  const ok = removeTextRuns(doc, page, groups.flat());
  const removed = new Set<string>();
  let k = 0;
  edits.forEach((e, i) => {
    if (groups[i].every(() => ok[k++])) removed.add(e.id);
  });
  if (!removed.size) return null;
  const pdf = await openPdf(await doc.save({ useObjectStreams: false }));
  return { page: await pdf.getPage(1), removed };
}
