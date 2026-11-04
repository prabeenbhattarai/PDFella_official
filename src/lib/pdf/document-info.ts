/**
 * Crop boxes, bookmarks and file details. Everything runs in the browser, and
 * saving doesn't stamp a producer, so "remove all details" really leaves none.
 */
import { PDFDict, PDFHexString, PDFName, PDFRef, PDFString, type PDFDocument } from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdf } from "./ops";

const save = (doc: PDFDocument) => doc.save({ useObjectStreams: true });

// ───────── crop

/** Share of the page to trim from each edge as displayed, 0 to 1. */
export interface CropMargins { left: number; top: number; right: number; bottom: number }

/** Displayed margins as margins of the unrotated page (rotation is clockwise). */
export function marginsForRotation(m: CropMargins, rotation: number): CropMargins {
  switch (((rotation % 360) + 360) % 360) {
    case 90: return { top: m.right, right: m.bottom, bottom: m.left, left: m.top };
    case 180: return { top: m.bottom, bottom: m.top, left: m.right, right: m.left };
    case 270: return { top: m.left, left: m.bottom, bottom: m.right, right: m.top };
    default: return m;
  }
}

export async function cropPdf(bytes: Uint8Array, margins: CropMargins, pages: "all" | number[]): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  doc.getPages().forEach((page, i) => {
    if (pages !== "all" && !pages.includes(i)) return;
    const m = marginsForRotation(margins, page.getRotation().angle);
    const box = page.getCropBox();
    page.setCropBox(box.x + box.width * m.left, box.y + box.height * m.bottom, box.width * (1 - m.left - m.right), box.height * (1 - m.top - m.bottom));
  });
  return save(doc);
}

// ───────── bookmarks

/** One row of the outline. `level` 0 is top level; `page` is zero-based. */
export interface Bookmark { title: string; page: number; level: number; top?: number | null; url?: string }

type OutlineNode = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>[number];

/** Read the outline as a flat list (pdf.js resolves named destinations for us). */
export async function readBookmarks(doc: PDFDocumentProxy): Promise<Bookmark[]> {
  const out: Bookmark[] = [];
  const walk = async (nodes: OutlineNode[], level: number) => {
    for (const n of nodes) {
      let page = 0;
      let top: number | null = null;
      try {
        const dest = typeof n.dest === "string" ? await doc.getDestination(n.dest) : n.dest;
        if (dest?.[0]) {
          page = typeof dest[0] === "number" ? dest[0] : await doc.getPageIndex(dest[0]);
          if ((dest[1] as { name?: string })?.name === "XYZ" && typeof dest[3] === "number") top = dest[3];
        }
      } catch { /* a broken destination falls back to the first page */ }
      out.push({ title: n.title, page, level, top, url: n.url ?? undefined });
      await walk(n.items ?? [], level + 1);
    }
  };
  await walk((await doc.getOutline()) ?? [], 0);
  return out;
}

export async function writeBookmarks(bytes: Uint8Array, list: Bookmark[]): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const { context, catalog } = doc;
  const pages = doc.getPages();
  catalog.delete(PDFName.of("Outlines"));
  if (!list.length) return save(doc);

  interface Node { item: Bookmark; ref: PDFRef; children: Node[] }
  const roots: Node[] = [];
  const stack: Node[] = [];
  for (const item of list) {
    const node: Node = { item, ref: context.nextRef(), children: [] };
    // A row can only be nested one level deeper than the row above it.
    while (stack.length > Math.min(item.level, stack.length)) stack.pop();
    (stack[stack.length - 1]?.children ?? roots).push(node);
    stack.push(node);
  }

  const count = (nodes: Node[]): number => nodes.reduce((n, c) => n + 1 + count(c.children), 0);
  const link = (dict: PDFDict, kids: Node[]) => {
    if (!kids.length) return;
    dict.set(PDFName.of("First"), kids[0].ref);
    dict.set(PDFName.of("Last"), kids[kids.length - 1].ref);
    dict.set(PDFName.of("Count"), context.obj(count(kids)));
  };
  const write = (kids: Node[], parent: PDFRef) => {
    kids.forEach((node, i) => {
      const { item } = node;
      const dict = context.obj({}) as PDFDict;
      dict.set(PDFName.of("Title"), PDFHexString.fromText(item.title));
      dict.set(PDFName.of("Parent"), parent);
      if (kids[i - 1]) dict.set(PDFName.of("Prev"), kids[i - 1].ref);
      if (kids[i + 1]) dict.set(PDFName.of("Next"), kids[i + 1].ref);
      if (item.url) {
        dict.set(PDFName.of("A"), context.obj({ S: "URI", URI: PDFString.of(item.url) }));
      } else {
        const page = pages[Math.max(0, Math.min(item.page, pages.length - 1))].ref;
        dict.set(PDFName.of("Dest"), item.top == null ? context.obj([page, "Fit"]) : context.obj([page, "XYZ", null, item.top, null]));
      }
      link(dict, node.children);
      context.assign(node.ref, dict);
      write(node.children, node.ref);
    });
  };

  const root = context.obj({ Type: "Outlines" }) as PDFDict;
  const rootRef = context.register(root);
  link(root, roots);
  write(roots, rootRef);
  catalog.set(PDFName.of("Outlines"), rootRef);
  return save(doc);
}

// ───────── file details

export interface FileDetails { title: string; author: string; subject: string; keywords: string; creator: string; producer: string }
export interface FileDates { created: Date | null; modified: Date | null }

export async function readDetails(bytes: Uint8Array): Promise<FileDetails & FileDates> {
  const doc = await loadPdf(bytes);
  return {
    title: doc.getTitle() ?? "",
    author: doc.getAuthor() ?? "",
    subject: doc.getSubject() ?? "",
    keywords: doc.getKeywords() ?? "",
    creator: doc.getCreator() ?? "",
    producer: doc.getProducer() ?? "",
    created: doc.getCreationDate() ?? null,
    modified: doc.getModificationDate() ?? null,
  };
}

const INFO_KEYS = { title: "Title", author: "Author", subject: "Subject", keywords: "Keywords", creator: "Creator", producer: "Producer" } as const;

/** Write the details; empty ones are removed, and `removeDates` also clears the dates. */
export async function writeDetails(bytes: Uint8Array, details: FileDetails, { removeDates = false } = {}): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  doc.setTitle(details.title);
  doc.setAuthor(details.author);
  doc.setSubject(details.subject);
  doc.setKeywords(details.keywords ? [details.keywords] : []);
  doc.setCreator(details.creator);
  doc.setProducer(details.producer);
  const info = doc.context.lookup(doc.context.trailerInfo.Info);
  if (info instanceof PDFDict) {
    for (const [key, name] of Object.entries(INFO_KEYS)) {
      if (!details[key as keyof FileDetails].trim()) info.delete(PDFName.of(name));
    }
    if (removeDates) { info.delete(PDFName.of("CreationDate")); info.delete(PDFName.of("ModDate")); }
  }
  // The XMP copy would otherwise keep showing the old details in some readers.
  doc.catalog.delete(PDFName.of("Metadata"));
  return save(doc);
}
