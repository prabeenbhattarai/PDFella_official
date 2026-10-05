"use client";

import { PDFDocument } from "pdf-lib";
import { uid } from "../utils";
import { registerSource, looksScanned, disposeAll } from "../pdf/docCache";
import { imagesToPdf } from "../pdf/ops";
import { sniffBytes, IMAGE_KINDS, OFFICE_KINDS } from "../security/filetype";
import { runJob } from "../processing/client";
import type { EditorObject, PageRef, SourceDoc } from "./model";
import { useEditor } from "./store";
import { local } from "../storage/local";
import { ensureUnlocked } from "../pdf/unlock";

export interface InputFile { name: string; type: string; bytes: Uint8Array }

export class UnsupportedFileError extends Error {
  constructor(name: string) { super(`“${name}” isn't a file type we can open.`); }
}

/** Turn any supported input into PDF bytes (images in-browser, Office via the processing service). */
export async function toPdfBytes(file: InputFile): Promise<{ name: string; bytes: Uint8Array }> {
  const kind = sniffBytes(file.bytes.subarray(0, 4096), file.name);
  const base = file.name.replace(/\.[^.]+$/, "");
  if (kind === "pdf") return { name: file.name, bytes: (await ensureUnlocked(file.name, file.bytes)).bytes };
  if (IMAGE_KINDS.includes(kind)) {
    const bytes = await imagesToPdf([{ bytes: file.bytes, type: kind === "jpg" ? "image/jpeg" : `image/${kind}` }], { pageSize: "fit", orientation: "auto", margin: 0 });
    return { name: `${base}.pdf`, bytes };
  }
  if (OFFICE_KINDS.includes(kind) || kind === "txt") {
    const { blob } = await runJob("office-to-pdf", [{ name: file.name, blob: new Blob([file.bytes as BlobPart], { type: file.type }) }]);
    return { name: `${base}.pdf`, bytes: new Uint8Array(await blob.arrayBuffer()) };
  }
  throw new UnsupportedFileError(file.name);
}

/** Register PDF bytes as a source and describe its pages. */
export async function createSource(name: string, bytes: Uint8Array, password?: string): Promise<{ source: SourceDoc; pages: PageRef[] }> {
  const id = uid("s");
  const doc = await registerSource(id, bytes, password);
  const pages: PageRef[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const [x1, y1, x2, y2] = p.view;
    pages.push({ id: uid("p"), sourceId: id, sourceIndex: i - 1, rotation: 0, baseRotation: p.rotate, width: x2 - x1, height: y2 - y1 });
  }
  let hasForm = false;
  try {
    const fields = await doc.getFieldObjects();
    hasForm = !!fields && Object.keys(fields).length > 0;
  } catch { /* ignore */ }
  const scanned = await looksScanned(doc).catch(() => false);
  return { source: { id, name, bytes, pageCount: doc.numPages, scanned, hasForm }, pages };
}

/** Open files as a brand-new editor document (the first file names the document). */
export async function openInEditor(files: InputFile[]) {
  const store = useEditor.getState();
  store.setStatus("loading");
  await disposeAll();
  const sources: SourceDoc[] = [];
  const pages: PageRef[] = [];
  for (const f of files) {
    const pdf = await toPdfBytes(f);
    const { source, pages: ps } = await createSource(pdf.name, pdf.bytes);
    sources.push(source);
    pages.push(...ps);
  }
  store.initDocument(sources[0]?.name ?? "document.pdf", sources, pages);
}

/** Insert another file's pages into the open document at a position. */
export async function insertFile(file: InputFile, at?: number) {
  const pdf = await toPdfBytes(file);
  const { source, pages } = await createSource(pdf.name, pdf.bytes);
  useEditor.getState().addSource(source, pages, at);
}

/** Start a new empty document with one blank A4 page. */
export async function newBlankDocument() {
  await disposeAll();
  const doc = await PDFDocument.create();
  doc.addPage([595.28, 841.89]);
  const bytes = await doc.save();
  const { source, pages } = await createSource("Untitled.pdf", bytes);
  useEditor.getState().initDocument("Untitled.pdf", [source], pages);
}

// ───────────────────────────── autosave

const AUTOSAVE_KEY = "autosave";

interface AutosaveRecord {
  v: 1;
  savedAt: number;
  docName: string;
  sources: { id: string; name: string; bytes: Uint8Array; pageCount: number }[];
  pages: PageRef[];
  objects: Record<string, EditorObject[]>;
  assets: Record<string, string>;
}

export async function writeAutosave() {
  const s = useEditor.getState();
  if (s.status !== "ready" || !s.pages.length) return;
  const rec: AutosaveRecord = {
    v: 1,
    savedAt: Date.now(),
    docName: s.docName,
    sources: Object.values(s.sources).map(({ id, name, bytes, pageCount }) => ({ id, name, bytes, pageCount })),
    pages: s.pages,
    objects: s.objects,
    assets: s.assets,
  };
  await local.set(AUTOSAVE_KEY, rec);
}

export async function readAutosaveMeta(): Promise<{ docName: string; savedAt: number; pages: number } | null> {
  const rec = await local.get<AutosaveRecord>(AUTOSAVE_KEY);
  if (!rec || rec.v !== 1) return null;
  // Auto-saves expire after 7 days.
  if (Date.now() - rec.savedAt > 7 * 24 * 3600_000) {
    await clearAutosave();
    return null;
  }
  return { docName: rec.docName, savedAt: rec.savedAt, pages: rec.pages.length };
}

export async function restoreAutosave(): Promise<boolean> {
  const rec = await local.get<AutosaveRecord>(AUTOSAVE_KEY);
  if (!rec) return false;
  const store = useEditor.getState();
  store.setStatus("loading");
  await disposeAll();
  const sources: SourceDoc[] = [];
  for (const s of rec.sources) {
    await registerSource(s.id, s.bytes);
    sources.push({ ...s });
  }
  store.initDocument(rec.docName, sources, rec.pages, rec.objects, rec.assets);
  return true;
}

export const clearAutosave = () => local.del(AUTOSAVE_KEY);

/** Replace a source's bytes (e.g. after OCR) while keeping pages, order and edits. */
export async function replaceSourceBytes(oldId: string, bytes: Uint8Array) {
  const s = useEditor.getState();
  const old = s.sources[oldId];
  const { source } = await createSource(old.name, bytes);
  useEditor.setState((st) => {
    const sources = { ...st.sources, [source.id]: { ...source, scanned: false } };
    delete sources[oldId];
    // History snapshots reference the old source, so they are reset.
    return { sources, past: [], future: [], pages: st.pages.map((p) => (p.sourceId === oldId ? { ...p, sourceId: source.id } : p)) };
  });
}
