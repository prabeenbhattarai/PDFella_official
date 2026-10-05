/**
 * PDF → Word (.docx), entirely in the browser.
 *
 * For each page we read positioned text from pdf.js, rebuild lines and
 * paragraphs (font size, bold/italic, alignment, indentation, headings), pull
 * embedded images in reading order, and write one Word section per page with
 * the original page size. It is fast because nothing is uploaded and work is
 * proportional to the text on the page; progress is reported per page.
 *
 * Limitations (stated in the UI): tables become text lines; complex multi-column
 * layouts flow in reading order; scanned pages need OCR first.
 */
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export interface ConvertProgress { page: number; pages: number; percent: number; stage: string }

interface Run { text: string; size: number; bold: boolean; italic: boolean; family: "sans" | "serif" | "mono" }
interface Line { x: number; y: number; right: number; size: number; runs: Run[] }
interface Block { kind: "para"; y: number; x: number; size: number; align: "left" | "center" | "right"; runs: Run[]; gapBefore: number }
interface ImageBlock { kind: "image"; y: number; x: number; png: Uint8Array; w: number; h: number }

const PT_TO_TWIP = 20;
const PT_TO_PX = 96 / 72;

function fontInfo(name: string, family: string): Pick<Run, "bold" | "italic" | "family"> {
  const n = `${name} ${family}`.toLowerCase();
  return {
    bold: /bold|black|heavy|semibold|demi|,b\b/.test(n),
    italic: /italic|oblique/.test(n),
    family: /courier|mono|consol/.test(n) ? "mono" : /times|serif|georgia|garamond|roman|cambria|minion|book/.test(n) && !/sans/.test(n) ? "serif" : "sans",
  };
}

async function realFontNames(page: PDFPageProxy, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of ids) {
    try {
      const f = page.commonObjs.get(id) as { name?: string } | undefined;
      out.set(id, f?.name ?? id);
    } catch { out.set(id, id); }
  }
  return out;
}

/** Group positioned text items into lines (top-down, left-to-right). */
function buildLines(items: TextItem[], fonts: Map<string, string>, styles: Record<string, { fontFamily: string }>): Line[] {
  const horiz = items.filter((i) => i.str && Math.abs(i.transform[1]) < 0.01 && Math.abs(i.transform[2]) < 0.01 && i.transform[0] > 0);
  const sorted = [...horiz].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
  const lines: Line[] = [];
  for (const it of sorted) {
    const size = Math.abs(it.transform[3]) || Math.abs(it.transform[0]);
    const x = it.transform[4], y = it.transform[5];
    const info = fontInfo(fonts.get(it.fontName) ?? it.fontName, styles[it.fontName]?.fontFamily ?? "");
    let line = lines.find((l) => Math.abs(l.y - y) < Math.max(l.size, size) * 0.45 && x >= l.x - size * 0.5);
    // Separate columns: a big horizontal jump on the same baseline starts a new line.
    if (line && x - line.right > Math.max(line.size, size) * 3) line = undefined;
    const run: Run = { text: it.str, size, ...info };
    if (!line) {
      lines.push({ x, y, right: x + it.width, size, runs: [run] });
      continue;
    }
    const gap = x - line.right;
    const last = line.runs[line.runs.length - 1];
    if (gap > size * 0.15 && !last.text.endsWith(" ") && !run.text.startsWith(" ")) last.text += " ";
    if (last.bold === run.bold && last.italic === run.italic && Math.abs(last.size - run.size) < 0.6 && last.family === run.family) last.text += run.text;
    else line.runs.push(run);
    line.right = Math.max(line.right, x + it.width);
    line.size = Math.max(line.size, size);
  }
  return lines.sort((a, b) => b.y - a.y || a.x - b.x);
}

/** Merge lines into paragraphs using spacing, indentation and size. */
function buildParagraphs(lines: Line[], pageWidth: number, marginLeft: number, marginRight: number): Block[] {
  const blocks: Block[] = [];
  const textWidth = pageWidth - marginLeft - marginRight;
  let prev: Line | null = null;
  let cur: Block | null = null;
  for (const l of lines) {
    const centre = (l.x + l.right) / 2;
    const width = l.right - l.x;
    const centred = Math.abs(centre - pageWidth / 2) < pageWidth * 0.04 && width < textWidth * 0.8 && l.x - marginLeft > pageWidth * 0.08;
    const rightAligned = !centred && Math.abs(l.right - (pageWidth - marginRight)) < 6 && l.x - marginLeft > textWidth * 0.4;
    const align: Block["align"] = centred ? "center" : rightAligned ? "right" : "left";
    const gap = prev ? prev.y - l.y : 0;
    const continues = cur && prev && align === cur.align && align === "left"
      && Math.abs(l.size - prev.size) < 0.8
      && gap < l.size * 1.75 && gap > 0
      && Math.abs(l.x - cur.x) < l.size * 2.5
      // A short previous line usually ends a paragraph.
      && prev.right > marginLeft + textWidth * 0.7;
    if (continues && cur) {
      const last = cur.runs[cur.runs.length - 1];
      if (last.text.endsWith("-") && !last.text.endsWith(" -")) last.text = last.text.slice(0, -1);
      else if (!last.text.endsWith(" ")) last.text += " ";
      for (const r of l.runs) {
        const tail = cur.runs[cur.runs.length - 1];
        if (tail.bold === r.bold && tail.italic === r.italic && Math.abs(tail.size - r.size) < 0.6 && tail.family === r.family) tail.text += r.text;
        else cur.runs.push({ ...r });
      }
    } else {
      cur = { kind: "para", y: l.y, x: l.x, size: l.size, align, runs: l.runs.map((r) => ({ ...r })), gapBefore: prev ? Math.max(0, gap - prev.size * 1.2) : 0 };
      blocks.push(cur);
    }
    prev = l;
  }
  return blocks;
}

/** Embedded raster images with their position, from the page's operator list. */
async function extractImages(page: PDFPageProxy, lib: typeof import("pdfjs-dist"), pageHeight: number): Promise<ImageBlock[]> {
  if (typeof document === "undefined") return [];
  const ops = await page.getOperatorList();
  const { OPS } = lib;
  const out: ImageBlock[] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const mul = (m: number[], n: number[]) => [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
  ];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(args as number[], ctm);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const w = Math.hypot(ctm[0], ctm[1]), h = Math.hypot(ctm[2], ctm[3]);
      if (w < 24 || h < 24) continue; // skip rules, bullets and icons
      try {
        const img = fn === OPS.paintInlineImageXObject ? args[0] : await new Promise<unknown>((resolve) => page.objs.get(args[0] as string, resolve));
        const png = await imageToPng(img as ImgLike);
        if (png) out.push({ kind: "image", y: ctm[5] + h, x: ctm[4], png, w, h: Math.min(h, pageHeight) });
      } catch { /* unsupported image encoding — skip */ }
    }
  }
  return out;
}

type ImgLike = { bitmap?: ImageBitmap; data?: Uint8ClampedArray | Uint8Array; width: number; height: number; kind?: number };

async function imageToPng(img: ImgLike): Promise<Uint8Array | null> {
  if (!img?.width || !img?.height) return null;
  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  const g = c.getContext("2d")!;
  if (img.bitmap) {
    g.drawImage(img.bitmap, 0, 0, c.width, c.height);
  } else if (img.data) {
    // pdf.js kinds: 1 = 1bpp grayscale, 2 = RGB 24bpp, 3 = RGBA 32bpp
    const n = img.width * img.height;
    const rgba = new Uint8ClampedArray(n * 4);
    if (img.kind === 3) rgba.set(img.data.subarray(0, n * 4));
    else if (img.kind === 2) for (let i = 0, j = 0; i < n; i++, j += 3) { rgba[i * 4] = img.data[j]; rgba[i * 4 + 1] = img.data[j + 1]; rgba[i * 4 + 2] = img.data[j + 2]; rgba[i * 4 + 3] = 255; }
    else return null;
    const tmp = document.createElement("canvas");
    tmp.width = img.width; tmp.height = img.height;
    tmp.getContext("2d")!.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
    g.drawImage(tmp, 0, 0, c.width, c.height);
  } else return null;
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

export async function pdfToDocx(
  pdf: PDFDocumentProxy,
  opts: { lib?: typeof import("pdfjs-dist"); onProgress?: (p: ConvertProgress) => void; title?: string } = {},
): Promise<{ blob: Blob; pages: number; words: number; images: number }> {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel } = docx;
  const lib = opts.lib ?? (await import("pdfjs-dist"));
  const pages = pdf.numPages;
  const sections: import("docx").ISectionOptions[] = [];
  let words = 0, images = 0;
  const report = (page: number, stage: string, within = 1) =>
    opts.onProgress?.({ page, pages, stage, percent: Math.min(99, Math.round(((page - 1 + within) / pages) * 95)) });

  for (let p = 1; p <= pages; p++) {
    report(p, `Reading page ${p} of ${pages}`, 0);
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.filter((i): i is TextItem => "str" in i);
    // Resolving real font names (for bold/italic) requires the fonts to be loaded.
    const imgBlocks = await extractImages(page, lib, vp.height).catch(() => [] as ImageBlock[]);
    if (typeof document === "undefined") await page.getOperatorList().catch(() => null);
    const fonts = await realFontNames(page, [...new Set(items.map((i) => i.fontName))]);
    report(p, `Rebuilding page ${p} of ${pages}`, 0.5);

    const lines = buildLines(items, fonts, content.styles as Record<string, { fontFamily: string }>);
    const xs = lines.map((l) => l.x);
    const marginLeft = xs.length ? Math.max(18, Math.min(...xs)) : 54;
    const rights = lines.map((l) => l.right);
    const marginRight = rights.length ? Math.max(18, vp.width - Math.max(...rights)) : 54;
    const topMost = lines.length ? vp.height - Math.max(...lines.map((l) => l.y + l.size)) : 54;
    const paras = buildParagraphs(lines, vp.width, marginLeft, marginRight);
    const sizes = paras.flatMap((b) => b.runs.map((r) => r.size)).sort((a, b) => a - b);
    const body = sizes[Math.floor(sizes.length / 2)] ?? 11;

    const blocks = [...paras, ...imgBlocks].sort((a, b) => b.y - a.y);
    const children: import("docx").Paragraph[] = [];
    const usable = vp.width - marginLeft - marginRight;
    for (const b of blocks) {
      if (b.kind === "image") {
        const scale = Math.min(1, usable / b.w);
        children.push(new Paragraph({
          spacing: { before: 120, after: 120 },
          indent: { left: Math.max(0, Math.round((b.x - marginLeft) * PT_TO_TWIP)) },
          children: [new ImageRun({ type: "png", data: b.png, transformation: { width: Math.round(b.w * scale * PT_TO_PX), height: Math.round(b.h * scale * PT_TO_PX) } })],
        }));
        images++;
        continue;
      }
      const maxSize = Math.max(...b.runs.map((r) => r.size));
      const heading = maxSize >= body * 1.6 ? HeadingLevel.HEADING_1 : maxSize >= body * 1.25 && b.runs.every((r) => r.bold || r.size > body * 1.2) ? HeadingLevel.HEADING_2 : undefined;
      words += b.runs.reduce((n, r) => n + r.text.split(/\s+/).filter(Boolean).length, 0);
      children.push(new Paragraph({
        heading,
        alignment: b.align === "center" ? AlignmentType.CENTER : b.align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
        indent: b.align === "left" && b.x - marginLeft > 4 ? { left: Math.round((b.x - marginLeft) * PT_TO_TWIP) } : undefined,
        spacing: { before: Math.round(Math.min(b.gapBefore, 48) * PT_TO_TWIP), after: 60, line: 276 },
        children: b.runs.map((r) => new TextRun({
          text: r.text,
          bold: r.bold,
          italics: r.italic,
          size: Math.round(r.size * 2),
          font: r.family === "serif" ? "Times New Roman" : r.family === "mono" ? "Courier New" : "Arial",
          color: heading ? "1F2328" : undefined,
        })),
      }));
    }
    if (!children.length) children.push(new Paragraph({ children: [] }));

    sections.push({
      properties: {
        page: {
          size: { width: Math.round(vp.width * PT_TO_TWIP), height: Math.round(vp.height * PT_TO_TWIP) },
          margin: { top: Math.round(Math.max(18, Math.min(topMost, 90)) * PT_TO_TWIP), bottom: 720, left: Math.round(Math.min(marginLeft, 90) * PT_TO_TWIP), right: Math.round(Math.min(marginRight, 90) * PT_TO_TWIP) },
        },
      },
      children,
    });
    page.cleanup();
    report(p, `Page ${p} of ${pages} done`, 1);
  }

  opts.onProgress?.({ page: pages, pages, stage: "Writing Word document", percent: 97 });
  const wordDoc = new Document({
    title: opts.title,
    creator: "PDFella",
    styles: { default: { document: { run: { font: "Arial" } } } },
    sections,
  });
  const blob = await Packer.toBlob(wordDoc);
  opts.onProgress?.({ page: pages, pages, stage: "Done", percent: 100 });
  return { blob, pages, words, images };
}
