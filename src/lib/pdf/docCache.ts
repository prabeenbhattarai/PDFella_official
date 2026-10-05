/**
 * Per-source pdf.js document cache plus text-run extraction in display space.
 */
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { openPdf, loadPdfjs } from "./pdfjs";
import type { Box, PageRef } from "../editor/model";
import { totalRotation } from "../editor/model";

const docs = new Map<string, Promise<PDFDocumentProxy>>();

export function registerSource(id: string, bytes: Uint8Array, password?: string) {
  if (!docs.has(id)) docs.set(id, openPdf(bytes, password));
  return docs.get(id)!;
}

export function getDoc(id: string): Promise<PDFDocumentProxy> {
  const d = docs.get(id);
  if (!d) throw new Error(`Unknown source ${id}`);
  return d;
}

export async function disposeAll() {
  const all = [...docs.values()];
  docs.clear();
  await Promise.allSettled(all.map(async (p) => (await p).destroy()));
}

export async function getPage(ref: PageRef): Promise<PDFPageProxy | null> {
  if (!ref.sourceId) return null;
  return (await getDoc(ref.sourceId)).getPage(ref.sourceIndex + 1);
}

export interface TextRun {
  str: string;
  box: Box;
  fontName: string;
  fontFamily: string;
  fontSize: number;
  /** Direction of the run in display space, degrees. 0 = left-to-right horizontal. */
  angle: number;
  /** Baseline origin in display space. */
  origin: [number, number];
  /** Origin, direction and extent in PDF user space. */
  pdf: { x: number; y: number; dx: number; dy: number; width: number; size: number };
}

const runCache = new Map<string, Promise<TextRun[]>>();

/** Text runs of a page in display space at scale 1 (for snapping, editing and search). */
export function getTextRuns(ref: PageRef): Promise<TextRun[]> {
  const key = `${ref.sourceId}:${ref.sourceIndex}:${totalRotation(ref)}`;
  let p = runCache.get(key);
  if (!p) {
    p = extractRuns(ref);
    runCache.set(key, p);
  }
  return p;
}

async function extractRuns(ref: PageRef): Promise<TextRun[]> {
  const page = await getPage(ref);
  if (!page) return [];
  const lib = await loadPdfjs();
  const vp = page.getViewport({ scale: 1, rotation: totalRotation(ref) });
  const content = await page.getTextContent();
  const runs: TextRun[] = [];
  for (const it of content.items) {
    const item = it as TextItem;
    if (!("str" in item) || !item.str.trim()) continue;
    const [a, b, c, d, e, f] = item.transform;
    const size = Math.hypot(c, d) || Math.hypot(a, b);
    const len = Math.hypot(a, b) || 1;
    const dir = [a / len, b / len];
    const up = [c / (Math.hypot(c, d) || 1), d / (Math.hypot(c, d) || 1)];
    const w = item.width;
    const asc = size * 0.88;
    const desc = size * 0.22;
    const corners = [
      [e - up[0] * desc, f - up[1] * desc],
      [e + dir[0] * w - up[0] * desc, f + dir[1] * w - up[1] * desc],
      [e + dir[0] * w + up[0] * asc, f + dir[1] * w + up[1] * asc],
      [e + up[0] * asc, f + up[1] * asc],
    ].map(([x, y]) => lib.Util.applyTransform([x, y], vp.transform));
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    const p0 = lib.Util.applyTransform([e, f], vp.transform);
    const p1 = lib.Util.applyTransform([e + dir[0], f + dir[1]], vp.transform);
    const angle = Math.round((Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI);
    const style = content.styles[item.fontName];
    runs.push({ str: item.str, box, fontName: item.fontName, fontFamily: style?.fontFamily ?? "", fontSize: size, angle, origin: [p0[0], p0[1]], pdf: { x: e, y: f, dx: dir[0], dy: dir[1], width: w, size } });
  }
  return runs;
}

export interface PdfFontInfo {
  /** PostScript name, e.g. "ABCDEF+Arial-BoldMT". */
  name: string;
  /** Embedded font program as converted by pdf.js (OpenType), when the PDF embeds it. */
  data: Uint8Array | null;
  bold: boolean;
  black: boolean;
  italic: boolean;
}

/** Font details for a pdf.js internal font id (e.g. "g_d0_f1"). */
export async function getFontInfo(ref: PageRef, loadedName: string): Promise<PdfFontInfo> {
  const fallback = { name: loadedName, data: null, bold: false, black: false, italic: false };
  const page = await getPage(ref);
  if (!page) return fallback;
  try {
    // Ensure fonts are loaded into commonObjs (operator list triggers font loading).
    await page.getOperatorList();
    const f = page.commonObjs.get(loadedName) as { name?: string; data?: Uint8Array; bold?: boolean; black?: boolean; italic?: boolean; missingFile?: boolean; isType3Font?: boolean } | undefined;
    if (!f) return fallback;
    const data = !f.missingFile && !f.isType3Font && f.data?.length ? f.data : null;
    return { name: f.name ?? loadedName, data, bold: !!f.bold, black: !!f.black, italic: !!f.italic };
  } catch {
    return fallback;
  }
}

/** Real PostScript font name for a pdf.js internal font id (e.g. "g_d0_f1" → "ABCDEF+Arial-BoldMT"). */
export async function resolveFontName(ref: PageRef, loadedName: string): Promise<string> {
  return (await getFontInfo(ref, loadedName)).name;
}

/** Heuristic: a page with almost no text but some images is probably a scan. */
export async function looksScanned(doc: PDFDocumentProxy): Promise<boolean> {
  const sample = Math.min(doc.numPages, 3);
  let chars = 0;
  for (let i = 1; i <= sample; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    chars += tc.items.reduce((n, it) => n + ("str" in it ? it.str.trim().length : 0), 0);
  }
  return chars / sample < 20;
}
