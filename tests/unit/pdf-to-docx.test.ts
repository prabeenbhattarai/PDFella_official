import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { pdfToDocx } from "@/lib/convert/pdf-to-docx";
import { fixture } from "./helpers";

async function docxText(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml")!.async("string");
  return { xml, text: [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("") };
}

describe("PDF → Word (browser converter)", () => {
  it("produces a valid .docx with the document's text, headings and progress", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: fixture("sample.pdf").slice() }).promise;
    const progress: number[] = [];
    const res = await pdfToDocx(pdf, { lib: pdfjs as never, onProgress: (p) => progress.push(p.percent) });
    expect(res.pages).toBe(3);
    const { text, xml } = await docxText(res.blob);
    expect(text).toContain("Service Agreement - Page 1");
    expect(text).toContain("Payment terms: 60 days from the date of invoice.");
    expect(xml).toContain("<w:pStyle w:val=\"Heading1\"/>");
    expect((xml.match(/<w:sectPr/g) ?? []).length).toBe(3); // one section (page) per PDF page
    expect(progress.at(-1)).toBe(100);
    expect(progress).toEqual([...progress].sort((a, b) => a - b)); // monotonic
  });
  it("joins word-per-run text into normal sentences", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: fixture("words.pdf").slice() }).promise;
    const { text } = await docxText((await pdfToDocx(pdf, { lib: pdfjs as never })).blob);
    expect(text).toContain("The invoice total is 1,250 USD payable today.");
  });
});
