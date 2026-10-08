/**
 * Export: combine the editor layers into a real PDF.
 *
 *   1. Assemble pages (reorder / rotate / duplicate / insert) on top of the
 *      primary source document so its AcroForm, metadata and outlines survive.
 *   2. Apply existing form values.
 *   3. Draw overlays as real vector/text/image content (pdf-lib).
 *   4. Add annotations (notes, links) and new AcroForm fields.
 *   5. Optional: flatten forms.
 *   6. Redactions (destructive): processing service when available, otherwise
 *      the affected pages are rebuilt from rasterised images in a fresh document.
 *   7. Prune orphaned objects so deleted pages/content do not linger in the file.
 */
import {
  BlendMode, LineCapStyle, PDFArray, PDFCheckBox, PDFDict, PDFDocument, PDFDropdown, PDFFont, PDFHexString,
  PDFName, PDFOptionList, PDFPage, PDFRadioGroup, PDFRef, PDFStream, PDFString, PDFTextField, StandardFonts,
  TextRenderingMode, concatTransformationMatrix, degrees, popGraphicsState, pushGraphicsState, rgb, setCharacterSpacing,
  setLineWidth, setStrokingColor, setTextRenderingMode, type PDFImage,
} from "pdf-lib";
import type { EditorObject, FieldObject, PageRef, SourceDoc, TextObject, TextEditObject } from "../editor/model";
import { totalRotation, displaySize } from "../editor/model";
import { ensureStyleFonts, facesFor, fontMetrics, fontStack, loadFontkit, type Face } from "../fonts/loader";
import { isBuiltin } from "../fonts/catalog";
import {
  PathBuilder, arrowHead, baselineOffset, boxTransform, checkPath, cloudPath, crossPath, ellipsePath, hexToRgb01,
  polygonPath, rectPath, rectToPdf, roundedRectPath, smoothStroke, starPoints, toPdf, wrapText, type PageFrame, type Pt,
} from "./geometry";
import { brand } from "../brand";
import { openPdf } from "./pdfjs";
import { applyTextRemovals, textRemovals } from "./page-preview";

export interface ExportInput {
  docName: string;
  sources: Record<string, SourceDoc>;
  pages: PageRef[];
  objects: Record<string, EditorObject[]>;
  assets: Record<string, string>;
  formValues: Record<string, string | boolean>;
}

export interface ExportOptions {
  flattenForms?: boolean;
  /** Server-side redaction hook; return null to fall back to client rasterisation. */
  serverRedact?: (pdf: Uint8Array, regions: RedactionRegion[]) => Promise<Uint8Array | null>;
  onProgress?: (label: string) => void;
}

export interface RedactionRegion { pageIndex: number; rect: [number, number, number, number] /* PDF space */; fill: string }

export class EncryptedPdfError extends Error {
  constructor() { super("This PDF is encrypted. Remove its password with Unlock PDF before editing."); }
}

const color = (hex: string) => rgb(...hexToRgb01(hex));

type FontKey = `${"Helvetica" | "Times" | "Courier"}-${0 | 1}-${0 | 1}`;
const FONT_MAP: Record<FontKey, StandardFonts> = {
  "Helvetica-0-0": StandardFonts.Helvetica, "Helvetica-1-0": StandardFonts.HelveticaBold,
  "Helvetica-0-1": StandardFonts.HelveticaOblique, "Helvetica-1-1": StandardFonts.HelveticaBoldOblique,
  "Times-0-0": StandardFonts.TimesRoman, "Times-1-0": StandardFonts.TimesRomanBold,
  "Times-0-1": StandardFonts.TimesRomanItalic, "Times-1-1": StandardFonts.TimesRomanBoldItalic,
  "Courier-0-0": StandardFonts.Courier, "Courier-1-0": StandardFonts.CourierBold,
  "Courier-0-1": StandardFonts.CourierOblique, "Courier-1-1": StandardFonts.CourierBoldOblique,
};

export async function exportDocument(input: ExportInput, opts: ExportOptions = {}): Promise<Uint8Array> {
  const progress = opts.onProgress ?? (() => {});
  progress("Assembling pages");

  // ── 1. Load sources
  const loaded = new Map<string, PDFDocument>();
  const usedSourceIds = [...new Set(input.pages.map((p) => p.sourceId).filter(Boolean))] as string[];
  for (const id of usedSourceIds) {
    try {
      loaded.set(id, await PDFDocument.load(input.sources[id].bytes, { updateMetadata: false }));
    } catch (e) {
      if ((e as Error)?.constructor?.name === "EncryptedPDFError" || /encrypted/i.test(String(e))) throw new EncryptedPdfError();
      throw e;
    }
  }
  const primaryId = usedSourceIds[0];
  const doc = primaryId ? loaded.get(primaryId)! : await PDFDocument.create();

  // Detach every page of the primary document, then rebuild the page tree in the new order.
  const primaryPages = primaryId ? doc.getPages() : [];
  for (let i = doc.getPageCount() - 1; i >= 0; i--) doc.removePage(i);
  const usedPrimary = new Set<number>();
  let pristinePrimary: PDFDocument | null = null;
  const outPages: PDFPage[] = [];
  for (const ref of input.pages) {
    let page: PDFPage;
    if (!ref.sourceId) {
      page = doc.addPage([ref.width, ref.height]);
    } else if (ref.sourceId === primaryId && !usedPrimary.has(ref.sourceIndex)) {
      usedPrimary.add(ref.sourceIndex);
      page = doc.addPage(primaryPages[ref.sourceIndex]);
    } else {
      // Copies of primary pages come from a pristine load: `doc`'s own page indices change as we rebuild it.
      let from = loaded.get(ref.sourceId)!;
      if (ref.sourceId === primaryId) {
        if (!pristinePrimary) pristinePrimary = await PDFDocument.load(input.sources[primaryId].bytes, { updateMetadata: false });
        from = pristinePrimary;
      }
      const [copy] = await doc.copyPages(from, [ref.sourceIndex]);
      page = doc.addPage(copy);
    }
    page.setRotation(degrees(totalRotation(ref)));
    outPages.push(page);
  }

  // ── 2. Existing form values
  const fonts = new Map<FontKey, PDFFont>();
  const font = async (family: "Helvetica" | "Times" | "Courier", bold: boolean, italic: boolean) => {
    const key = `${family}-${bold ? 1 : 0}-${italic ? 1 : 0}` as FontKey;
    if (!fonts.has(key)) fonts.set(key, await doc.embedFont(FONT_MAP[key]));
    return fonts.get(key)!;
  };
  if (Object.keys(input.formValues).length) {
    progress("Filling form");
    applyFormValues(doc, input.formValues);
    try { doc.getForm().updateFieldAppearances(await font("Helvetica", false, false)); } catch { /* non-standard form, appearances left as is */ }
  }

  // ── 3/4. Overlays, annotations, fields
  progress("Applying edits");
  const images = new Map<string, PDFImage>();
  const embedded = new Map<string, Promise<PDFFont | null>>();
  const redactions: RedactionRegion[] = [];
  for (let i = 0; i < input.pages.length; i++) {
    const ref = input.pages[i];
    const page = outPages[i];
    const crop = page.getCropBox();
    const frame: PageFrame = { rotation: totalRotation(ref), box: crop };
    const ctx: DrawCtx = { doc, page, frame, font, images, assets: input.assets, removed: new Set(), embedded };
    // Content edits first: delete original glyphs (edited lines, text-only whiteouts)
    // from the page's own content stream. Anything that can't be removed is covered.
    for (const id of applyTextRemovals(doc, page, textRemovals(input.objects[ref.id]))) ctx.removed.add(id);
    for (const obj of input.objects[ref.id] ?? []) {
      if (obj.kind === "redact") {
        redactions.push({ pageIndex: i, rect: rectToPdf(frame, obj), fill: obj.fill });
        continue;
      }
      await drawObject(ctx, obj);
    }
  }
  pruneOrphans(doc);

  // ── 5. Flatten
  const mustFlatten = opts.flattenForms || redactions.length > 0;
  if (mustFlatten) {
    try { doc.getForm().flatten(); } catch { /* no form */ }
  }

  doc.setProducer(`${brand.name} PDF`);
  doc.setModificationDate(new Date());
  if (!doc.getTitle()) doc.setTitle(input.docName.replace(/\.pdf$/i, ""));

  let bytes = await doc.save({ useObjectStreams: true });

  // ── 6. Redactions
  if (redactions.length) {
    progress("Applying redactions");
    const server = opts.serverRedact ? await opts.serverRedact(bytes, redactions).catch(() => null) : null;
    bytes = server ?? (await rasterRedact(bytes, redactions));
  }
  return bytes;
}

// ───────────────────────────────────────────── drawing

interface DrawCtx {
  doc: PDFDocument;
  page: PDFPage;
  frame: PageFrame;
  font: (f: "Helvetica" | "Times" | "Courier", b: boolean, i: boolean) => Promise<PDFFont>;
  images: Map<string, PDFImage>;
  assets: Record<string, string>;
  /** textEdit ids whose original glyphs were removed from the content stream. */
  removed: Set<string>;
  /** Embedded library/original fonts, by face key. */
  embedded: Map<string, Promise<PDFFont | null>>;
}

/** Draw an SVG path given in display coordinates. */
function drawPath(ctx: DrawCtx, d: string, o: { fill?: string | null; stroke?: string | null; strokeWidth?: number; opacity?: number; multiply?: boolean; round?: boolean }) {
  if (!d || (!o.fill && !o.stroke)) return;
  const [x, y] = toPdf(ctx.frame, 0, 0);
  ctx.page.drawSvgPath(d, {
    x, y,
    rotate: degrees(ctx.frame.rotation),
    color: o.fill ? color(o.fill) : undefined,
    borderColor: o.stroke ? color(o.stroke) : undefined,
    borderWidth: o.stroke ? o.strokeWidth ?? 1 : 0,
    opacity: o.opacity ?? 1,
    borderOpacity: o.opacity ?? 1,
    borderLineCap: o.round ? LineCapStyle.Round : undefined,
    blendMode: o.multiply ? BlendMode.Multiply : undefined,
  });
}

async function embedAsset(ctx: DrawCtx, assetId: string, crop?: { x: number; y: number; w: number; h: number }): Promise<PDFImage | null> {
  const key = crop ? `${assetId}:${crop.x}:${crop.y}:${crop.w}:${crop.h}` : assetId;
  if (ctx.images.has(key)) return ctx.images.get(key)!;
  let url = ctx.assets[assetId];
  if (!url) return null;
  const isCropped = crop && (crop.x > 0.001 || crop.y > 0.001 || crop.w < 0.999 || crop.h < 0.999);
  if (isCropped) url = await cropDataUrl(url, crop!);
  const bytes = dataUrlToBytes(url);
  const img = url.startsWith("data:image/png") ? await ctx.doc.embedPng(bytes) : await ctx.doc.embedJpg(bytes);
  ctx.images.set(key, img);
  return img;
}

async function drawObject(ctx: DrawCtx, obj: EditorObject) {
  const tf = boxTransform(obj);
  const pb = () => new PathBuilder(tf);
  const { frame, page } = ctx;
  switch (obj.kind) {
    case "whiteout":
      // Text-only whiteout: the text was deleted above; nothing is painted (images stay visible).
      if (obj.mode === "text" && (ctx.removed.has(obj.id) || !obj.runs?.length)) return;
      return drawPath(ctx, rectPath(pb(), obj.w, obj.h).toString(), { fill: obj.color, opacity: obj.opacity });
    case "highlight":
      return drawPath(ctx, rectPath(pb(), obj.w, obj.h).toString(), { fill: obj.color, opacity: obj.opacity, multiply: true });
    case "underline":
    case "strike": {
      const t = Math.max(0.75, obj.h * 0.07);
      const yy = obj.kind === "underline" ? obj.h - t : obj.h * 0.55;
      return drawPath(ctx, pb().M(0, yy).L(obj.w, yy).toString(), { stroke: obj.color, strokeWidth: t, opacity: obj.opacity });
    }
    case "rect":
    case "ellipse":
    case "cloud":
    case "polygon": {
      const p = pb();
      if (obj.kind === "rect") rectPath(p, obj.w, obj.h);
      else if (obj.kind === "ellipse") ellipsePath(p, obj.w, obj.h);
      else if (obj.kind === "cloud") cloudPath(p, obj.w, obj.h);
      else polygonPath(p, obj.points ?? [[0.5, 0], [1, 1], [0, 1]], obj.w, obj.h);
      return drawPath(ctx, p.toString(), { fill: obj.fill, stroke: obj.stroke, strokeWidth: obj.strokeWidth, opacity: obj.opacity });
    }
    case "line":
    case "arrow": {
      const line = new PathBuilder().M(obj.x1, obj.y1).L(obj.x2, obj.y2).toString();
      drawPath(ctx, line, { stroke: obj.stroke, strokeWidth: obj.strokeWidth, opacity: obj.opacity, round: true });
      if (obj.kind === "arrow") {
        const h = arrowHead(obj.x1, obj.y1, obj.x2, obj.y2, obj.strokeWidth);
        const d = new PathBuilder().M(...h[0]).L(...h[1]).L(...h[2]).Z().toString();
        drawPath(ctx, d, { fill: obj.stroke, opacity: obj.opacity });
      }
      return;
    }
    case "ink": {
      const p = pb();
      for (const s of obj.strokes) smoothStroke(p, s.map(([x, y]) => [x * obj.w, y * obj.h] as Pt));
      return drawPath(ctx, p.toString(), { stroke: obj.stroke, strokeWidth: obj.strokeWidth, opacity: obj.opacity, round: true });
    }
    case "check":
      return drawPath(ctx, checkPath(pb(), obj.w, obj.h).toString(), { stroke: obj.color, strokeWidth: Math.max(1.5, obj.w * 0.12), opacity: obj.opacity, round: true });
    case "cross":
      return drawPath(ctx, crossPath(pb(), obj.w, obj.h).toString(), { stroke: obj.color, strokeWidth: Math.max(1.5, obj.w * 0.12), opacity: obj.opacity, round: true });
    case "star":
      return drawPath(ctx, polygonPath(pb(), starPoints(), obj.w, obj.h).toString(), { fill: obj.color, opacity: obj.opacity });
    case "dot":
      return drawPath(ctx, ellipsePath(pb(), obj.w, obj.h).toString(), { fill: obj.color, opacity: obj.opacity });
    case "stamp": {
      const border = obj.borderColor === undefined ? obj.color : obj.borderColor;
      const sw = border ? Math.max(1.5, Math.min(obj.w, obj.h) * 0.06) : 0;
      if (border) {
        const inset = new PathBuilder((x, y) => tf(x + sw / 2, y + sw / 2));
        drawPath(ctx, roundedRectPath(inset, obj.w - sw, obj.h - sw, Math.min(obj.h * 0.18, 8)).toString(), { stroke: border, strokeWidth: sw, opacity: obj.opacity });
      }
      const f = await ctx.font("Helvetica", true, false);
      const label = toWinAnsi(obj.label);
      const size = Math.min(obj.h * 0.5, ((obj.w - Math.max(sw, 1.5) * 4) / Math.max(1, f.widthOfTextAtSize(label, 1))));
      const tw = f.widthOfTextAtSize(label, size);
      const [ax, ay] = toPdf(frame, ...tf((obj.w - tw) / 2, obj.h / 2 + size * 0.36));
      page.drawText(label, { x: ax, y: ay, size, font: f, color: color(obj.textColor ?? obj.color), opacity: obj.opacity, rotate: degrees(frame.rotation - obj.rotation) });
      return;
    }
    case "image":
    case "signature": {
      const img = await embedAsset(ctx, obj.asset, obj.crop);
      if (!img) return;
      const [ax, ay] = toPdf(frame, ...tf(0, obj.h));
      page.drawImage(img, { x: ax, y: ay, width: obj.w, height: obj.h, rotate: degrees(frame.rotation - obj.rotation), opacity: obj.opacity });
      return;
    }
    case "text":
      return drawText(ctx, obj);
    case "textEdit": {
      // If the original glyphs were deleted, only the replacement is drawn. Otherwise
      // (overlay strategy, or removal wasn't safe) cover the original first.
      if (ctx.removed.has(obj.id)) return drawText(ctx, obj);
      const o = obj.original.box;
      const pad = 0.5;
      const cover = new PathBuilder((x, y) => [o.x - pad + x, o.y - pad + y]);
      drawPath(ctx, rectPath(cover, o.w + pad * 2, o.h + pad * 2).toString(), { fill: obj.cover });
      return drawText(ctx, obj);
    }
    case "note":
      return addNote(ctx, obj);
    case "link":
      return addLink(ctx, obj);
    case "field":
      return addField(ctx, obj);
  }
}

/** A font that can draw part of a line, plus how to synthesise a missing style. */
interface PdfFace { pdf: PDFFont; covers: (ch: string) => boolean; fauxBold: boolean; fauxItalic: boolean }
type Segment = { text: string; face: PdfFace | null; width: number };

async function embedFace(ctx: DrawCtx, f: Face): Promise<PDFFont | null> {
  const key = `${f.id}/${f.variant}-${f.subset}`;
  let p = ctx.embedded.get(key);
  if (!p) {
    p = (async () => {
      ctx.doc.registerFontkit(await loadFontkit());
      try {
        return await ctx.doc.embedFont(f.bytes, { subset: true });
      } catch {
        // Some converted PDF fonts can't be subset again; embed them whole (they are already subsets).
        try { return await ctx.doc.embedFont(f.bytes, { subset: false }); } catch { return null; }
      }
    })();
    ctx.embedded.set(key, p);
  }
  return p;
}

/** Fonts used to draw a text object, in the same fallback order as the browser's CSS stack. */
async function textFaces(ctx: DrawCtx, obj: TextObject | TextEditObject): Promise<PdfFace[]> {
  if (isBuiltin(obj.font)) {
    const pdf = await ctx.font(obj.font, obj.bold, obj.italic);
    return [{ pdf, covers: (ch) => canEncode(pdf, ch), fauxBold: false, fauxItalic: false }];
  }
  const out: PdfFace[] = [];
  for (const f of await facesFor(obj, ctx.assets)) {
    const pdf = await embedFace(ctx, f);
    if (pdf) out.push({ pdf, covers: (ch) => f.font.hasGlyphForCodePoint(ch.codePointAt(0)!), fauxBold: f.fauxBold, fauxItalic: f.fauxItalic });
  }
  if (obj.fontFallback && isBuiltin(obj.fontFallback)) {
    const pdf = await ctx.font(obj.fontFallback, obj.bold, obj.italic);
    out.push({ pdf, covers: (ch) => canEncode(pdf, ch), fauxBold: false, fauxItalic: false });
  }
  return out;
}

/**
 * Split a line into runs per font, a word at a time: a word uses the first font that
 * has all of its letters (so a word never mixes fonts unless no single font can draw it).
 * Spaces never switch fonts: if the current font lacks a space glyph (common in embedded
 * subsets) the gap is left as an advance. Null if some character can't be drawn at all.
 */
function segmentLine(line: string, faces: PdfFace[], size: number, ls: number): Segment[] | null {
  const segs: Segment[] = [];
  const push = (text: string, face: PdfFace | null) => {
    const cur = segs[segs.length - 1];
    if (cur && cur.face === face) cur.text += text;
    else segs.push({ text, face, width: 0 });
  };
  for (const token of line.split(/(\s+)/)) {
    if (!token) continue;
    if (/^\s+$/.test(token)) {
      const cur = segs[segs.length - 1]?.face ?? null;
      push(token, cur?.covers(" ") ? cur : null);
      continue;
    }
    const whole = faces.find((f) => [...token].every((ch) => f.covers(ch)));
    if (whole) { push(token, whole); continue; }
    for (const ch of token) {
      const f = faces.find((x) => x.covers(ch));
      if (!f) return null;
      push(ch, f);
    }
  }
  const spaceFace = faces.find((f) => f.covers(" "));
  for (const sg of segs) {
    const n = [...sg.text].length;
    const natural = sg.face
      ? sg.face.pdf.widthOfTextAtSize(sg.text.replace(/\s/g, " "), size)
      : spaceFace ? spaceFace.pdf.widthOfTextAtSize(" ", size) * n : n * size * 0.25;
    sg.width = natural + ls * n;
  }
  return segs;
}

const lineWidth = (segs: Segment[], ls: number) => Math.max(0, segs.reduce((w, sg) => w + sg.width, 0) - ls);

async function drawText(ctx: DrawCtx, obj: TextObject | TextEditObject) {
  if (!obj.text.trim()) return;
  const { frame, page } = ctx;
  const tf = boxTransform(obj);
  await ensureStyleFonts(obj, ctx.assets);
  const faces = await textFaces(ctx, obj);
  const ls = obj.letterSpacing || 0;
  const measure = (str: string) => segmentLine(str, faces, obj.size, ls);
  // Anything no font can draw (e.g. CJK in a Latin font) falls back to a high-resolution image.
  if (!faces.length || obj.text.split("\n").some((l) => !measure(l))) return drawTextAsImage(ctx, obj);

  if (obj.background) drawPath(ctx, rectPath(new PathBuilder(tf), obj.w, obj.h).toString(), { fill: obj.background, opacity: obj.opacity });

  const lines = wrapText(obj.text, obj.w + 0.5, (str) => lineWidth(measure(str)!, ls));
  const metrics = fontMetrics(obj);
  const rot = frame.rotation - obj.rotation;
  const rad = (rot * Math.PI) / 180;
  const c = color(obj.color);
  if (ls) page.pushOperators(pushGraphicsState(), setCharacterSpacing(ls));
  lines.forEach((line, i) => {
    const segs = measure(line)!;
    const lw = lineWidth(segs, ls);
    const lx = obj.align === "center" ? (obj.w - lw) / 2 : obj.align === "right" ? obj.w - lw : 0;
    const base = baselineOffset(metrics, obj.size, obj.lineHeight, i);
    let cx = lx;
    for (const sg of segs) {
      if (sg.face && sg.text.trim()) {
        const [x, y] = toPdf(frame, ...tf(cx, base));
        const f = sg.face;
        const faux = f.fauxBold || f.fauxItalic;
        if (faux) {
          page.pushOperators(pushGraphicsState());
          if (f.fauxBold) page.pushOperators(setTextRenderingMode(TextRenderingMode.FillAndOutline), setLineWidth(obj.size * 0.035), setStrokingColor(c));
        }
        if (f.fauxItalic) {
          // Slant in the text's own frame, then rotate/translate into place.
          page.pushOperators(concatTransformationMatrix(Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), x, y), concatTransformationMatrix(1, 0, Math.tan((12 * Math.PI) / 180), 1, 0, 0));
          page.drawText(sg.text, { x: 0, y: 0, size: obj.size, font: f.pdf, color: c, opacity: obj.opacity });
        } else {
          page.drawText(sg.text, { x, y, size: obj.size, font: f.pdf, color: c, opacity: obj.opacity, rotate: degrees(rot) });
        }
        if (faux) page.pushOperators(popGraphicsState());
      }
      cx += sg.width;
    }
    if (obj.underline && line.trim()) {
      const uy = base + obj.size * 0.12;
      const d = new PathBuilder(tf).M(lx, uy).L(lx + lw, uy).toString();
      drawPath(ctx, d, { stroke: obj.color, strokeWidth: Math.max(0.5, obj.size * 0.06), opacity: obj.opacity });
    }
  });
  if (ls) page.pushOperators(popGraphicsState());
}

function canEncode(f: PDFFont, text: string) {
  try {
    f.encodeText(text.replace(/\n/g, ""));
    return true;
  } catch {
    return false;
  }
}

/** Characters outside WinAnsi (e.g. CJK, Devanagari, emoji) are rendered as a high-resolution image. */
async function drawTextAsImage(ctx: DrawCtx, obj: TextObject | TextEditObject) {
  const scale = 4;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(obj.w * scale);
  canvas.height = Math.ceil(obj.h * scale);
  const g = canvas.getContext("2d")!;
  g.scale(scale, scale);
  if (obj.background) { g.fillStyle = obj.background; g.fillRect(0, 0, obj.w, obj.h); }
  g.fillStyle = obj.color;
  g.textBaseline = "alphabetic";
  await ensureStyleFonts(obj, ctx.assets);
  g.font = `${obj.italic ? "italic " : ""}${obj.bold ? "bold " : ""}${obj.size}px ${fontStack(obj)}`;
  if ("letterSpacing" in g) (g as unknown as { letterSpacing: string }).letterSpacing = `${obj.letterSpacing}px`;
  const lines = wrapText(obj.text, obj.w + 0.5, (s) => g.measureText(s).width);
  lines.forEach((line, i) => {
    const lw = g.measureText(line).width;
    const lx = obj.align === "center" ? (obj.w - lw) / 2 : obj.align === "right" ? obj.w - lw : 0;
    const by = baselineOffset(fontMetrics(obj), obj.size, obj.lineHeight, i);
    g.fillText(line, lx, by);
    if (obj.underline && line.trim()) g.fillRect(lx, by + obj.size * 0.09, lw, Math.max(0.5, obj.size * 0.06));
  });
  const png = await ctx.doc.embedPng(dataUrlToBytes(canvas.toDataURL("image/png")));
  const tf = boxTransform(obj);
  const [x, y] = toPdf(ctx.frame, ...tf(0, obj.h));
  ctx.page.drawImage(png, { x, y, width: obj.w, height: obj.h, rotate: degrees(ctx.frame.rotation - obj.rotation), opacity: obj.opacity });
}

function addAnnot(page: PDFPage, dict: PDFDict) {
  const ref = page.doc.context.register(dict);
  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (annots) annots.push(ref);
  else page.node.set(PDFName.of("Annots"), page.doc.context.obj([ref]));
  return ref;
}

function addNote(ctx: DrawCtx, obj: Extract<EditorObject, { kind: "note" }>) {
  const [x, y] = rectToPdf(ctx.frame, { x: obj.x, y: obj.y, w: 20, h: 20 });
  const c = hexToRgb01(obj.color);
  addAnnot(ctx.page, ctx.doc.context.obj({
    Type: "Annot", Subtype: "Text", Rect: [x, y, x + 20, y + 20],
    Contents: PDFHexString.fromText(obj.text), T: PDFHexString.fromText(obj.author || "Reviewer"),
    Name: "Comment", C: c, F: 4, Open: false, M: PDFString.fromDate(new Date()),
  }));
}

function addLink(ctx: DrawCtx, obj: Extract<EditorObject, { kind: "link" }>) {
  const url = obj.url.trim();
  if (!/^(https?:|mailto:)/i.test(url)) return; // never write javascript:/file: URIs
  const [x, y, w, h] = rectToPdf(ctx.frame, obj);
  addAnnot(ctx.page, ctx.doc.context.obj({
    Type: "Annot", Subtype: "Link", Rect: [x, y, x + w, y + h], Border: [0, 0, 0], F: 4,
    A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
  }));
}

function uniqueFieldName(doc: PDFDocument, base: string) {
  const form = doc.getForm();
  const existing = new Set(form.getFields().map((f) => f.getName()));
  const clean = (base || "field").replace(/[.\s]+/g, "_");
  let name = clean, n = 2;
  while (existing.has(name)) name = `${clean}_${n++}`;
  return name;
}

async function addField(ctx: DrawCtx, obj: FieldObject) {
  const { doc, page, frame } = ctx;
  const form = doc.getForm();
  const [x, y, width, height] = rectToPdf(frame, obj);
  const common = { x, y, width, height, rotate: degrees(frame.rotation), borderColor: rgb(0.55, 0.58, 0.64), borderWidth: 0.75, backgroundColor: rgb(0.95, 0.97, 1) };
  const helv = await ctx.font("Helvetica", false, false);
  switch (obj.fieldType) {
    case "text":
    case "date": {
      const tfield = form.createTextField(uniqueFieldName(doc, obj.name));
      if (obj.required) tfield.enableRequired();
      tfield.addToPage(page, { ...common, font: helv });
      tfield.setFontSize(Math.max(8, Math.min(14, height * 0.6)));
      if (obj.fieldType === "date") {
        // Acrobat-compatible date formatting/keystroke validation.
        const js = (s: string) => ({ S: "JavaScript", JS: PDFString.of(s) });
        tfield.acroField.dict.set(PDFName.of("AA"), doc.context.obj({ F: js('AFDate_FormatEx("yyyy-mm-dd");'), K: js('AFDate_KeystrokeEx("yyyy-mm-dd");') }));
      }
      return;
    }
    case "checkbox": {
      const cb = form.createCheckBox(uniqueFieldName(doc, obj.name));
      if (obj.required) cb.enableRequired();
      cb.addToPage(page, common);
      return;
    }
    case "radio": {
      const groupName = (obj.group || "group").replace(/[.\s]+/g, "_");
      let group: PDFRadioGroup;
      try { group = form.getRadioGroup(groupName); } catch { group = form.createRadioGroup(groupName); }
      group.addOptionToPage(obj.name || `option_${obj.id.slice(-4)}`, page, common);
      return;
    }
    case "dropdown": {
      const dd = form.createDropdown(uniqueFieldName(doc, obj.name));
      dd.addOptions(obj.options.length ? obj.options : ["Option 1", "Option 2"]);
      if (obj.required) dd.enableRequired();
      dd.addToPage(page, { ...common, font: helv });
      return;
    }
    case "signature": {
      // pdf-lib has no signature-field API; build the merged field/widget dictionary directly.
      const ref = addAnnot(page, doc.context.obj({
        Type: "Annot", Subtype: "Widget", FT: "Sig", T: PDFHexString.fromText(uniqueFieldName(doc, obj.name)),
        Rect: [x, y, x + width, y + height], F: 4, P: page.ref, MK: { BC: [0.55, 0.58, 0.64], BG: [0.95, 0.97, 1] },
      }));
      const acro = doc.catalog.getOrCreateAcroForm();
      acro.dict.lookup(PDFName.of("Fields"), PDFArray).push(ref);
      acro.dict.set(PDFName.of("SigFlags"), doc.context.obj(1));
      return;
    }
  }
}

function applyFormValues(doc: PDFDocument, values: Record<string, string | boolean>) {
  const form = doc.getForm();
  for (const [name, value] of Object.entries(values)) {
    try {
      const f = form.getField(name);
      if (f instanceof PDFTextField) f.setText(String(value));
      else if (f instanceof PDFCheckBox) { if (value) f.check(); else f.uncheck(); }
      else if (f instanceof PDFDropdown) f.select(String(value));
      else if (f instanceof PDFRadioGroup) { if (value) f.select(String(value)); }
      else if (f instanceof PDFOptionList) f.select(String(value));
    } catch { /* unknown or read-only field */ }
  }
}

// ───────────────────────────────────────────── cleanup

/**
 * Remove references to pages that are no longer in the page tree (form widgets,
 * outline destinations) and then drop every unreachable object, so deleted pages
 * and their content are not silently carried along in the saved file.
 */
export function pruneOrphans(doc: PDFDocument) {
  const ctx = doc.context;
  const live = new Set(doc.getPages().map((p) => p.ref.toString()));
  const isDeadPage = (v: unknown) => v instanceof PDFRef && ctx.lookup(v) instanceof PDFDict && (ctx.lookup(v) as PDFDict).get(PDFName.of("Type"))?.toString() === "/Page" && !live.has(v.toString());

  // AcroForm fields whose widgets all sit on removed pages.
  const acro = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  const fields = acro?.lookupMaybe(PDFName.of("Fields"), PDFArray);
  if (fields) {
    const pruneField = (ref: unknown): boolean => {
      const dict = ref instanceof PDFRef ? ctx.lookup(ref) : ref;
      if (!(dict instanceof PDFDict)) return false;
      const kids = dict.lookupMaybe(PDFName.of("Kids"), PDFArray);
      if (kids) {
        for (let i = kids.size() - 1; i >= 0; i--) if (!pruneField(kids.get(i))) kids.remove(i);
        return kids.size() > 0;
      }
      const p = dict.get(PDFName.of("P"));
      return !(p && isDeadPage(p));
    };
    for (let i = fields.size() - 1; i >= 0; i--) if (!pruneField(fields.get(i))) fields.remove(i);
  }

  // Outline items pointing at removed pages lose their destination (the item itself is kept).
  const outlines = doc.catalog.lookupMaybe(PDFName.of("Outlines"), PDFDict);
  const walk = (item: PDFDict | undefined, depth = 0) => {
    for (let node = item; node && depth < 64; node = node.lookupMaybe(PDFName.of("Next"), PDFDict)) {
      const dest = node.lookupMaybe(PDFName.of("Dest"), PDFArray);
      if (dest && isDeadPage(dest.get(0))) node.delete(PDFName.of("Dest"));
      const action = node.lookupMaybe(PDFName.of("A"), PDFDict);
      const d = action?.lookupMaybe(PDFName.of("D"), PDFArray);
      if (d && isDeadPage(d.get(0))) node.delete(PDFName.of("A"));
      walk(node.lookupMaybe(PDFName.of("First"), PDFDict), depth + 1);
    }
  };
  if (outlines) walk(outlines.lookupMaybe(PDFName.of("First"), PDFDict));

  // Mark & sweep from the trailer.
  const reachable = new Set<string>();
  const stack: unknown[] = [ctx.trailerInfo.Root, ctx.trailerInfo.Info].filter(Boolean);
  while (stack.length) {
    const v = stack.pop();
    if (v instanceof PDFRef) {
      const k = v.toString();
      if (reachable.has(k)) continue;
      reachable.add(k);
      stack.push(ctx.lookup(v));
    } else if (v instanceof PDFDict) {
      for (const [, val] of v.entries()) stack.push(val);
    } else if (v instanceof PDFArray) {
      for (let i = 0; i < v.size(); i++) stack.push(v.get(i));
    } else if (v instanceof PDFStream) {
      stack.push(v.dict);
    }
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!reachable.has(ref.toString())) ctx.delete(ref);
  }
}

// ───────────────────────────────────────────── redaction (client fallback)

/**
 * Client-side permanent redaction: every page that contains a redaction is
 * rendered to an image with the redaction boxes painted in, and the final PDF
 * is rebuilt in a *fresh* document so no original content stream, font or
 * metadata of those pages survives. Unaffected pages are copied unchanged.
 */
export async function rasterRedact(bytes: Uint8Array, regions: RedactionRegion[], dpi = 200): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const pdfjsDoc = await openPdf(bytes);
  let invisibleFont: PDFFont | undefined;
  const byPage = new Map<number, RedactionRegion[]>();
  regions.forEach((r) => byPage.set(r.pageIndex, [...(byPage.get(r.pageIndex) ?? []), r]));

  for (let i = 0; i < src.getPageCount(); i++) {
    const regs = byPage.get(i);
    if (!regs) {
      const [p] = await out.copyPages(src, [i]);
      out.addPage(p);
      continue;
    }
    const page = await pdfjsDoc.getPage(i + 1);
    const scale = dpi / 72;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    for (const r of regs) {
      const [x, y, w, h] = r.rect;
      const [ax, ay] = vp.convertToViewportPoint(x, y);
      const [bx, by] = vp.convertToViewportPoint(x + w, y + h);
      g.fillStyle = r.fill;
      g.fillRect(Math.min(ax, bx) - 1, Math.min(ay, by) - 1, Math.abs(bx - ax) + 2, Math.abs(by - ay) + 2);
    }
    const jpg = await out.embedJpg(dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.9)));
    const vp1 = page.getViewport({ scale: 1 });
    const { width, height } = vp1;
    const np = out.addPage([width, height]);
    np.drawImage(jpg, { x: 0, y: 0, width, height });

    // Restore an invisible, searchable text layer for everything outside the redacted areas.
    const boxes = regs.map((r) => {
      const [x, y, w, h] = r.rect;
      const [ax, ay] = vp1.convertToViewportPoint(x, y);
      const [bx, by] = vp1.convertToViewportPoint(x + w, y + h);
      return { x: Math.min(ax, bx) - 1, y: Math.min(ay, by) - 1, w: Math.abs(bx - ax) + 2, h: Math.abs(by - ay) + 2 };
    });
    const font = (invisibleFont ??= await out.embedFont(StandardFonts.Helvetica));
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const [a, b, c, d, e, f] = it.transform;
      const size = Math.hypot(c, d);
      if (size < 1) continue;
      const [x0, y0] = vp1.convertToViewportPoint(e, f);
      const len = Math.hypot(a, b) || 1;
      const [x1, y1] = vp1.convertToViewportPoint(e + (a / len) * it.width, f + (b / len) * it.width);
      const angle = Math.atan2(y1 - y0, x1 - x0);
      const chars = [...it.str];
      const step = Math.hypot(x1 - x0, y1 - y0) / Math.max(1, chars.length);
      // Keep runs of characters whose approximate boxes avoid every redaction.
      let seg = "", segStart = 0;
      const flush = (endIdx: number) => {
        const text = toWinAnsi(seg);
        if (text.trim()) {
          const px = x0 + Math.cos(angle) * step * segStart, py = y0 + Math.sin(angle) * step * segStart;
          np.drawText(text, { x: px, y: height - py, size, font, opacity: 0, rotate: degrees((-angle * 180) / Math.PI) });
        }
        seg = ""; segStart = endIdx + 1;
      };
      chars.forEach((ch, k) => {
        const cx = x0 + Math.cos(angle) * step * (k + 0.5), cy = y0 + Math.sin(angle) * step * (k + 0.5) - size * 0.35;
        const hit = boxes.some((bx) => cx >= bx.x && cx <= bx.x + bx.w && cy >= bx.y && cy <= bx.y + bx.h);
        if (hit) flush(k); else seg += ch;
      });
      flush(chars.length);
    }
  }
  await pdfjsDoc.destroy();
  out.setProducer(`${brand.name} PDF`);
  out.setTitle(src.getTitle() ?? "");
  return out.save({ useObjectStreams: true });
}

// ───────────────────────────────────────────── helpers

export function dataUrlToBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function cropDataUrl(url: string, crop: { x: number; y: number; w: number; h: number }): Promise<string> {
  const img = await loadImage(url);
  const sx = crop.x * img.naturalWidth, sy = crop.y * img.naturalHeight;
  const sw = crop.w * img.naturalWidth, sh = crop.h * img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw));
  c.height = Math.max(1, Math.round(sh));
  c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = url;
  });
}

/** Replace characters the standard fonts cannot encode. */
export function toWinAnsi(s: string) {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

export function pageDisplaySize(p: PageRef) {
  return displaySize(p);
}
