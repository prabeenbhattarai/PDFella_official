import { readFileSync } from "node:fs";
import path from "node:path";

export const fixture = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, "..", "fixtures", name)));

/** Extract text per page with pdf.js (legacy build runs in Node). */
export async function pdfText(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map((t) => ("str" in t ? t.str : "")).join(" "));
  }
  await doc.destroy();
  return out;
}

export async function pageInfo(bytes: Uint8Array) {
  const { PDFDocument } = await import("pdf-lib");
  const d = await PDFDocument.load(bytes);
  return d.getPages().map((p) => ({ rotation: p.getRotation().angle, ...p.getSize() }));
}
