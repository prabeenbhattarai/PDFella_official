/**
 * Small pdf-lib helpers with no browser dependencies, shared by the editor
 * export, the standalone tools (ops.ts) and the public API service.
 */
import { PDFArray, PDFDict, PDFName, PDFRef, PDFStream, type PDFDocument } from "pdf-lib";

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

export function dataUrlToBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Replace characters the standard fonts cannot encode. */
export function toWinAnsi(s: string) {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}
