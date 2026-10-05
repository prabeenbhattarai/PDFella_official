/**
 * Standalone PDF operations used by tool workspaces. All run in the browser
 * with pdf-lib / pdf.js; nothing here uploads anything.
 */
import {
  PDFDocument, PDFName, PDFRawStream, PDFNumber, StandardFonts, degrees, rgb, decodePDFRawStream, PDFDict,
} from "pdf-lib";
import JSZip from "jszip";
import { openPdf } from "./pdfjs";
import { dataUrlToBytes, pruneOrphans, toWinAnsi } from "./export";
import { hexToRgb01 } from "./geometry";
import { brand } from "../brand";

const finish = (doc: PDFDocument) => {
  doc.setProducer(`${brand.name} PDF`);
  doc.setModificationDate(new Date());
  return doc.save({ useObjectStreams: true });
};

export async function loadPdf(bytes: Uint8Array) {
  return PDFDocument.load(bytes, { updateMetadata: false });
}

// ───────── organise

export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const bytes of files) {
    const src = await loadPdf(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return finish(out);
}

/** New PDF containing the given zero-based pages, in the given order. */
export async function extractPages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  out.setTitle(src.getTitle() ?? "");
  return finish(out);
}

export type SplitMode =
  | { type: "ranges"; groups: number[][] }
  | { type: "every"; n: number }
  | { type: "oddEven" };

export async function splitPdf(bytes: Uint8Array, mode: SplitMode, pageCount: number): Promise<{ name: string; bytes: Uint8Array }[]> {
  let groups: { name: string; pages: number[] }[] = [];
  const all = Array.from({ length: pageCount }, (_, i) => i);
  if (mode.type === "ranges") {
    groups = mode.groups.filter((g) => g.length).map((g) => ({ name: g.length === 1 ? `page-${g[0] + 1}` : `pages-${g[0] + 1}-${g[g.length - 1] + 1}`, pages: g }));
  } else if (mode.type === "every") {
    for (let i = 0; i < pageCount; i += mode.n) {
      const pages = all.slice(i, i + mode.n);
      groups.push({ name: pages.length === 1 ? `page-${i + 1}` : `pages-${i + 1}-${pages[pages.length - 1] + 1}`, pages });
    }
  } else {
    groups = [
      { name: "odd-pages", pages: all.filter((i) => i % 2 === 0) },
      { name: "even-pages", pages: all.filter((i) => i % 2 === 1) },
    ].filter((g) => g.pages.length);
  }
  const out = [];
  for (const g of groups) out.push({ name: g.name, bytes: await extractPages(bytes, g.pages) });
  return out;
}

export interface PagePlanItem { sourceIndex: number | null; rotation: number; width?: number; height?: number }

/** Rebuild a document from a page plan (reorder / rotate / delete / insert blank). */
export async function applyPagePlan(bytes: Uint8Array, plan: PagePlanItem[]): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const original = doc.getPages();
  for (let i = doc.getPageCount() - 1; i >= 0; i--) doc.removePage(i);
  // Duplicates are copied from a pristine copy: indices in `doc` change as pages are re-added.
  let pristine: PDFDocument | null = null;
  const used = new Set<number>();
  for (const item of plan) {
    if (item.sourceIndex === null) {
      doc.addPage([item.width ?? 595.28, item.height ?? 841.89]);
      continue;
    }
    let page = original[item.sourceIndex];
    if (used.has(item.sourceIndex)) {
      pristine ??= await loadPdf(bytes);
      [page] = await doc.copyPages(pristine, [item.sourceIndex]);
    }
    used.add(item.sourceIndex);
    const p = doc.addPage(page);
    p.setRotation(degrees((((p.getRotation().angle + item.rotation) % 360) + 360) % 360));
  }
  pruneOrphans(doc);
  return finish(doc);
}

// ───────── stamping

export type Position = "top-left" | "top-center" | "top-right" | "middle-left" | "center" | "middle-right" | "bottom-left" | "bottom-center" | "bottom-right";

export interface WatermarkOptions {
  kind: "text" | "image";
  text?: string;
  image?: string; // data URL
  font?: "Helvetica" | "Times" | "Courier";
  bold?: boolean;
  size: number;
  color: string;
  opacity: number;
  rotation: number;
  position: Position | "tile";
  imageScale?: number;
  pages: number[] | "all";
  layer: "over" | "under";
}

const fontFor = (f: WatermarkOptions["font"] = "Helvetica", bold = false) =>
  f === "Times" ? (bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman)
    : f === "Courier" ? (bold ? StandardFonts.CourierBold : StandardFonts.Courier)
      : bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica;

/** Place a w×h box in the *visible* page area and return its PDF-space centre. */
function anchorFor(pos: Position, pw: number, ph: number, w: number, h: number, margin: number): [number, number] {
  const [v, hz] = pos === "center" ? ["middle", "center"] : pos.split("-");
  const cx = hz === "left" ? margin + w / 2 : hz === "right" ? pw - margin - w / 2 : pw / 2;
  const cy = v === "top" ? ph - margin - h / 2 : v === "bottom" ? margin + h / 2 : ph / 2;
  return [cx, cy];
}

/**
 * Draw something at a point given in *visual* page coordinates (bottom-left
 * origin, after /Rotate), compensating for the page rotation so the result
 * appears upright to the reader.
 */
function visualToUser(rot: number, w: number, h: number, ox: number, oy: number, vx: number, vy: number): [number, number] {
  switch (rot) {
    case 90: return [ox + w - vy, oy + vx];
    case 180: return [ox + w - vx, oy + h - vy];
    case 270: return [ox + vy, oy + h - vx];
    default: return [ox + vx, oy + vy];
  }
}

export async function addWatermark(bytes: Uint8Array, o: WatermarkOptions): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(fontFor(o.font, o.bold));
  const img = o.kind === "image" && o.image
    ? o.image.startsWith("data:image/png") ? await doc.embedPng(dataUrlToBytes(o.image)) : await doc.embedJpg(dataUrlToBytes(o.image))
    : null;
  const text = toWinAnsi(o.text ?? "");
  const pages = doc.getPages();
  const targets = o.pages === "all" ? pages.map((_, i) => i) : o.pages;
  const c = rgb(...hexToRgb01(o.color));

  for (const i of targets) {
    const page = pages[i];
    if (!page) continue;
    const rot = page.getRotation().angle % 360;
    const box = page.getCropBox();
    const vw = rot % 180 ? box.height : box.width;
    const vh = rot % 180 ? box.width : box.height;
    const w = img ? img.width * (o.imageScale ?? 0.3) : font.widthOfTextAtSize(text, o.size);
    const h = img ? img.height * (o.imageScale ?? 0.3) : font.heightAtSize(o.size, { descender: false });

    const centres: [number, number][] = [];
    if (o.position === "tile") {
      const stepX = w + 120, stepY = h + 140;
      for (let y = stepY / 2; y < vh + stepY; y += stepY) for (let x = (Math.round(y / stepY) % 2) * (stepX / 2); x < vw + stepX; x += stepX) centres.push([x, y]);
    } else centres.push(anchorFor(o.position, vw, vh, w, h, 36));

    const draw = () => {
      for (const [cx, cy] of centres) {
        // Bottom-left corner of the box rotated about its centre (visual space, CCW degrees).
        const a = ((o.rotation) * Math.PI) / 180;
        const bx = cx + (-w / 2) * Math.cos(a) - (-h / 2) * Math.sin(a);
        const by = cy + (-w / 2) * Math.sin(a) + (-h / 2) * Math.cos(a);
        const [ux, uy] = visualToUser(rot, box.width, box.height, box.x, box.y, bx, by);
        const angle = degrees(o.rotation + rot);
        if (img) page.drawImage(img, { x: ux, y: uy, width: w, height: h, rotate: angle, opacity: o.opacity });
        else page.drawText(text, { x: ux, y: uy, size: o.size, font, color: c, rotate: angle, opacity: o.opacity });
      }
    };
    if (o.layer === "under") {
      // Draw, then move the newly appended content stream to the front so it sits beneath existing content.
      page.node.normalize();
      draw();
      const arr = page.node.normalizedEntries().Contents;
      if (arr && arr.size() > 1) {
        const last = arr.get(arr.size() - 1);
        arr.remove(arr.size() - 1);
        arr.insert(0, last);
      }
    } else draw();
  }
  return finish(doc);
}

export interface StampTextOptions {
  /** Template with {page} {pages} {date} {name} tokens. */
  left?: string; center?: string; right?: string;
  where: "header" | "footer";
  size: number;
  color: string;
  margin: number;
  font?: "Helvetica" | "Times" | "Courier";
  startAt: number;
  pages: number[] | "all";
  docName: string;
}

export function fillTemplate(t: string, page: number, pages: number, docName: string) {
  return t
    .replaceAll("{page}", String(page))
    .replaceAll("{pages}", String(pages))
    .replaceAll("{date}", new Date().toLocaleDateString())
    .replaceAll("{name}", docName);
}

export async function addHeaderFooter(bytes: Uint8Array, o: StampTextOptions): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(fontFor(o.font));
  const pages = doc.getPages();
  const targets = o.pages === "all" ? pages.map((_, i) => i) : o.pages;
  const total = targets.length + o.startAt - 1;
  const c = rgb(...hexToRgb01(o.color));
  targets.forEach((i, k) => {
    const page = pages[i];
    if (!page) return;
    const rot = page.getRotation().angle % 360;
    const box = page.getCropBox();
    const vw = rot % 180 ? box.height : box.width;
    const vh = rot % 180 ? box.width : box.height;
    const y = o.where === "header" ? vh - o.margin - o.size * 0.75 : o.margin;
    const slots: ["left" | "center" | "right", string | undefined][] = [["left", o.left], ["center", o.center], ["right", o.right]];
    for (const [slot, tmpl] of slots) {
      if (!tmpl) continue;
      const text = toWinAnsi(fillTemplate(tmpl, k + o.startAt, total, o.docName));
      const tw = font.widthOfTextAtSize(text, o.size);
      const x = slot === "left" ? o.margin : slot === "right" ? vw - o.margin - tw : (vw - tw) / 2;
      const [ux, uy] = visualToUser(rot, box.width, box.height, box.x, box.y, x, y);
      page.drawText(text, { x: ux, y: uy, size: o.size, font, color: c, rotate: degrees(rot) });
    }
  });
  return finish(doc);
}

// ───────── forms

export async function flattenPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  doc.getForm().flatten();
  return finish(doc);
}

// ───────── conversion (browser)

export interface ImagesToPdfOptions {
  pageSize: "fit" | "a4" | "letter";
  orientation: "auto" | "portrait" | "landscape";
  margin: number;
}

const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;

export async function imagesToPdf(images: { bytes: Uint8Array; type: string }[], o: ImagesToPdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const im of images) {
    const { bytes, png } = await normaliseImage(im.bytes, im.type);
    const img = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    let pw: number, ph: number;
    if (o.pageSize === "fit") {
      pw = img.width * 0.75 + o.margin * 2; // 96dpi px → pt
      ph = img.height * 0.75 + o.margin * 2;
    } else {
      [pw, ph] = SIZES[o.pageSize];
      const landscape = o.orientation === "landscape" || (o.orientation === "auto" && img.width > img.height);
      if (landscape) [pw, ph] = [ph, pw];
    }
    const page = doc.addPage([pw, ph]);
    const scale = Math.min((pw - o.margin * 2) / img.width, (ph - o.margin * 2) / img.height);
    const w = img.width * scale, h = img.height * scale;
    page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  return finish(doc);
}

/** pdf-lib embeds PNG and JPEG only; anything else is transcoded to PNG via canvas. */
export async function normaliseImage(bytes: Uint8Array, type: string): Promise<{ bytes: Uint8Array; png: boolean }> {
  if (type === "image/jpeg" || type === "jpg") return { bytes, png: false };
  if (type === "image/png" || type === "png") return { bytes, png: true };
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return { bytes: dataUrlToBytes(c.toDataURL("image/png")), png: true };
}

export async function pdfToImages(
  bytes: Uint8Array, format: "jpg" | "png", dpi: number, indices: number[] | "all", baseName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ blob: Blob; name: string }> {
  const doc = await openPdf(bytes);
  const list = indices === "all" ? Array.from({ length: doc.numPages }, (_, i) => i) : indices;
  const zip = new JSZip();
  let single: Blob | null = null;
  for (let k = 0; k < list.length; k++) {
    const page = await doc.getPage(list[k] + 1);
    const vp = page.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), format === "png" ? "image/png" : "image/jpeg", 0.92));
    if (list.length === 1) single = blob;
    else zip.file(`${baseName}-page-${String(list[k] + 1).padStart(3, "0")}.${format}`, blob);
    page.cleanup();
    canvas.width = canvas.height = 0;
    onProgress?.(k + 1, list.length);
  }
  await doc.destroy();
  if (single) return { blob: single, name: `${baseName}.${format}` };
  return { blob: await zip.generateAsync({ type: "blob" }), name: `${baseName}-${format}.zip` };
}

export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const doc = await openPdf(bytes);
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let lastY: number | null = null;
    let text = "";
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      const y = it.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) text += "\n";
      else if (text && !text.endsWith(" ") && !it.str.startsWith(" ")) text += it.hasEOL ? "\n" : "";
      text += it.str;
      if (it.hasEOL) text += "\n";
      lastY = y;
    }
    parts.push(`──────── Page ${i} ────────\n${text.replace(/\n{3,}/g, "\n\n").trim()}`);
  }
  await doc.destroy();
  return parts.join("\n\n");
}

// ───────── compression (browser)

export interface CompressOptions {
  /** Max image resolution in DPI-equivalent pixels for the longest side relative to page. */
  maxImageDim: number;
  jpegQuality: number;
}

export const compressPresets = {
  recommended: { maxImageDim: 1600, jpegQuality: 0.72 },
  high: { maxImageDim: 1100, jpegQuality: 0.55 },
  quality: { maxImageDim: 2400, jpegQuality: 0.85 },
} satisfies Record<string, CompressOptions>;

/**
 * Browser-side compression: re-encodes embedded raster images (JPEG, and 8-bit
 * RGB/Gray Flate images) at a lower resolution/quality and rewrites the file
 * with object streams and without orphaned objects. Text and vectors are
 * untouched, so the document stays selectable and searchable.
 */
export async function compressPdf(bytes: Uint8Array, o: CompressOptions, onProgress?: (done: number, total: number) => void): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const ctx = doc.context;
  const imageRefs = ctx.enumerateIndirectObjects().filter(([, obj]) =>
    obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype"))?.toString() === "/Image");
  let done = 0;
  for (const [ref, obj] of imageRefs) {
    onProgress?.(done++, imageRefs.length);
    const stream = obj as PDFRawStream;
    const d = stream.dict;
    try {
      if (d.has(PDFName.of("SMask")) || d.has(PDFName.of("Mask")) || d.get(PDFName.of("ImageMask"))?.toString() === "true") continue;
      const width = (d.lookup(PDFName.of("Width")) as PDFNumber).asNumber();
      const height = (d.lookup(PDFName.of("Height")) as PDFNumber).asNumber();
      const filter = d.get(PDFName.of("Filter"))?.toString() ?? "";
      const cs = d.get(PDFName.of("ColorSpace"))?.toString() ?? "";
      const bpc = (d.lookupMaybe(PDFName.of("BitsPerComponent"), PDFNumber))?.asNumber() ?? 8;
      if (width * height < 200 * 200) continue;

      let bitmap: ImageBitmap | null = null;
      if (filter === "/DCTDecode" && (cs === "/DeviceRGB" || cs === "/DeviceGray")) {
        bitmap = await createImageBitmap(new Blob([stream.contents as BlobPart], { type: "image/jpeg" }));
      } else if (filter === "/FlateDecode" && bpc === 8 && (cs === "/DeviceRGB" || cs === "/DeviceGray") && !d.has(PDFName.of("DecodeParms"))) {
        const raw = decodePDFRawStream(stream).decode();
        const comps = cs === "/DeviceRGB" ? 3 : 1;
        if (raw.length < width * height * comps) continue;
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0, j = 0; i < width * height; i++, j += comps) {
          rgba[i * 4] = raw[j];
          rgba[i * 4 + 1] = raw[comps === 3 ? j + 1 : j];
          rgba[i * 4 + 2] = raw[comps === 3 ? j + 2 : j];
          rgba[i * 4 + 3] = 255;
        }
        bitmap = await createImageBitmap(new ImageData(rgba, width, height));
      }
      if (!bitmap) continue;

      const scale = Math.min(1, o.maxImageDim / Math.max(width, height));
      const nw = Math.max(1, Math.round(width * scale)), nh = Math.max(1, Math.round(height * scale));
      const canvas = new OffscreenCanvas(nw, nh);
      const g = canvas.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, nw, nh);
      g.drawImage(bitmap, 0, 0, nw, nh);
      bitmap.close();
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: o.jpegQuality });
      const jpeg = new Uint8Array(await blob.arrayBuffer());
      if (jpeg.length >= stream.contents.length) continue; // never make an image bigger

      const nd = ctx.obj({}) as PDFDict;
      for (const [k, v] of d.entries()) {
        if (["/Filter", "/DecodeParms", "/Length", "/Width", "/Height", "/ColorSpace", "/BitsPerComponent", "/Decode"].includes(k.toString())) continue;
        nd.set(k, v);
      }
      nd.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
      nd.set(PDFName.of("Width"), ctx.obj(nw));
      nd.set(PDFName.of("Height"), ctx.obj(nh));
      nd.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
      nd.set(PDFName.of("BitsPerComponent"), ctx.obj(8));
      nd.set(PDFName.of("Length"), ctx.obj(jpeg.length));
      ctx.assign(ref, PDFRawStream.of(nd, jpeg));
    } catch {
      /* leave this image as it was */
    }
  }
  onProgress?.(imageRefs.length, imageRefs.length);
  pruneOrphans(doc);
  // Drop bulky optional metadata.
  doc.catalog.delete(PDFName.of("Metadata"));
  doc.catalog.delete(PDFName.of("PieceInfo"));
  return doc.save({ useObjectStreams: true });
}
