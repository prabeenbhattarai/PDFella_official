import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mergePdfs, extractPages, splitPdf, applyPagePlan, addWatermark, addHeaderFooter, flattenPdf } from "@/lib/pdf/ops";
import { fixture, pdfText, pageInfo } from "./helpers";

const sample = fixture("sample.pdf");
const form = fixture("form.pdf");

describe("organise", () => {
  it("merges files in order", async () => {
    const out = await mergePdfs([sample, form]);
    const text = await pdfText(out);
    expect(text).toHaveLength(4);
    expect(text[0]).toContain("Page 1");
    expect(text[3]).toContain("Application form");
  });
  it("extracts pages in the requested order", async () => {
    const text = await pdfText(await extractPages(sample, [2, 0]));
    expect(text[0]).toContain("Page 3");
    expect(text[1]).toContain("Page 1");
  });
  it("splits by ranges, fixed size and odd/even", async () => {
    expect(await splitPdf(sample, { type: "ranges", groups: [[0], [1, 2]] }, 3)).toHaveLength(2);
    expect(await splitPdf(sample, { type: "every", n: 1 }, 3)).toHaveLength(3);
    const oe = await splitPdf(sample, { type: "oddEven" }, 3);
    expect((await pdfText(oe[0].bytes)).length).toBe(2);
  });
  it("applies a page plan with rotation, deletion, duplication and blank pages", async () => {
    const out = await applyPagePlan(sample, [
      { sourceIndex: 1, rotation: 90 },
      { sourceIndex: 0, rotation: 0 },
      { sourceIndex: 0, rotation: 180 },
      { sourceIndex: null, rotation: 0 },
    ]);
    const info = await pageInfo(out);
    expect(info.map((p) => p.rotation)).toEqual([90, 0, 180, 0]);
    const text = await pdfText(out);
    expect(text[0]).toContain("Page 2");
    expect(text[3].trim()).toBe("");
  });
  it("does not carry deleted pages' content in the file", async () => {
    const out = await applyPagePlan(sample, [{ sourceIndex: 0, rotation: 0 }]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
    // Only one page object remains in the whole file (orphans were pruned).
    const pages = doc.context.enumerateIndirectObjects().filter(([, o]) => o.toString().includes("/Type /Page\n") || o.toString().includes("/Type /Page "));
    expect(pages.length).toBe(1);
  });
});

describe("stamping", () => {
  it("adds a text watermark to selected pages only", async () => {
    const out = await addWatermark(sample, { kind: "text", text: "DRAFT", size: 40, color: "#ff0000", opacity: 0.3, rotation: 45, position: "center", pages: [0], layer: "over" });
    const text = await pdfText(out);
    expect(text[0]).toContain("DRAFT");
    expect(text[1]).not.toContain("DRAFT");
  });
  it("adds page numbers with tokens", async () => {
    const out = await addHeaderFooter(sample, { center: "Page {page} of {pages}", where: "footer", size: 9, color: "#000000", margin: 20, startAt: 1, pages: "all", docName: "x" });
    const text = await pdfText(out);
    expect(text[2]).toContain("Page 3 of 3");
  });
  it("flattens form fields", async () => {
    const out = await flattenPdf(form);
    const doc = await PDFDocument.load(out);
    expect(doc.getForm().getFields()).toHaveLength(0);
  });
});
