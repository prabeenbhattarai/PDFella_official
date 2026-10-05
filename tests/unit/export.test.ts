import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { exportDocument, type ExportInput } from "@/lib/pdf/export";
import { defaultTextStyle, type EditorObject, type PageRef } from "@/lib/editor/model";
import { fixture, pdfText, pageInfo } from "./helpers";

const sample = fixture("sample.pdf");
const form = fixture("form.pdf");

function input(pages: PageRef[], objects: Record<string, EditorObject[]> = {}, extra: Partial<ExportInput> = {}): ExportInput {
  return {
    docName: "test.pdf",
    sources: { s1: { id: "s1", name: "sample.pdf", bytes: sample, pageCount: 3 }, s2: { id: "s2", name: "form.pdf", bytes: form, pageCount: 1 } },
    pages, objects, assets: {}, formValues: {}, ...extra,
  };
}
const page = (id: string, sourceIndex: number, rotation = 0, baseRotation = 0, sourceId: string | null = "s1"): PageRef => ({ id, sourceId, sourceIndex, rotation, baseRotation, width: 595.28, height: 841.89 });
const base = { rotation: 0, opacity: 1 };

describe("exportDocument", () => {
  it("reorders, rotates, inserts blank pages and pages from another file", async () => {
    const out = await exportDocument(input([page("a", 2, 0, 90), page("b", 0, 90), page("c", 0, 0, 0, null), page("d", 0, 0, 0, "s2")]));
    const text = await pdfText(out);
    expect(text[0]).toContain("Page 3");
    expect(text[1]).toContain("Page 1");
    expect(text[2].trim()).toBe("");
    expect(text[3]).toContain("Application form");
    expect((await pageInfo(out)).map((p) => p.rotation)).toEqual([90, 90, 0, 0]); // page 3 of the fixture is intrinsically rotated
  });

  it("writes new text as real, extractable text", async () => {
    const t: EditorObject = { ...base, ...defaultTextStyle, id: "t", kind: "text", text: "Signed by Alex", x: 60, y: 400, w: 200, h: 20 };
    const [first] = await pdfText(await exportDocument(input([page("a", 0)], { a: [t] })));
    expect(first).toContain("Signed by Alex");
  });

  it("replaces existing text by removing the original glyphs", async () => {
    // Fixture: "Payment terms: 60 days..." drawn by pdf-lib at x=60, y=720-24.
    const edit: EditorObject = {
      ...base, ...defaultTextStyle, id: "e", kind: "textEdit", text: "Payment terms: 30 days from the date of invoice.",
      x: 60, y: 140, w: 320, h: 16, cover: "#ffffff", strategy: "remove",
      original: { text: "Payment terms: 60 days from the date of invoice.", box: { x: 60, y: 135, w: 280, h: 14 }, fontName: "Helvetica", pdf: { x: 60, y: 696, dx: 1, dy: 0, width: 280, size: 12 } },
    };
    const [first] = await pdfText(await exportDocument(input([page("a", 0)], { a: [edit] })));
    expect(first).toContain("30 days");
    expect(first).not.toContain("60 days");
  });

  it("draws shapes, ink, stamps, whiteout and highlights without error", async () => {
    const objs: EditorObject[] = [
      { ...base, id: "1", kind: "rect", x: 10, y: 10, w: 50, h: 40, stroke: "#ff0000", fill: null, strokeWidth: 2 },
      { ...base, id: "2", kind: "ellipse", x: 70, y: 10, w: 50, h: 40, stroke: "#00ff00", fill: "#0000ff", strokeWidth: 1, rotation: 30 },
      { ...base, id: "3", kind: "cloud", x: 130, y: 10, w: 80, h: 50, stroke: "#000000", fill: null, strokeWidth: 1 },
      { ...base, id: "4", kind: "arrow", x: 10, y: 80, w: 100, h: 1, x1: 10, y1: 80, x2: 110, y2: 80, stroke: "#000000", strokeWidth: 2 },
      { ...base, id: "5", kind: "ink", x: 10, y: 100, w: 50, h: 20, stroke: "#000000", strokeWidth: 2, strokes: [[[0, 0], [0.5, 1], [1, 0]]] },
      { ...base, id: "6", kind: "stamp", x: 10, y: 140, w: 140, h: 40, label: "APPROVED", color: "#2e9e5b" },
      { ...base, id: "7", kind: "whiteout", x: 10, y: 200, w: 50, h: 20, color: "#ffffff" },
      { ...base, id: "8", kind: "highlight", x: 10, y: 230, w: 50, h: 12, color: "#ffe14d", opacity: 0.5 },
      { ...base, id: "9", kind: "check", x: 10, y: 260, w: 20, h: 20, color: "#00aa00" },
      { ...base, id: "10", kind: "star", x: 40, y: 260, w: 20, h: 20, color: "#ffaa00" },
    ];
    const out = await exportDocument(input([page("a", 0, 90)], { a: objs }));
    const [first] = await pdfText(out);
    expect(first).toContain("APPROVED");
  });

  it("adds sticky notes and links as real annotations, and new form fields", async () => {
    const objs: EditorObject[] = [
      { ...base, id: "n", kind: "note", x: 100, y: 100, w: 20, h: 20, text: "Check this", color: "#ffd84d", author: "Alex" },
      { ...base, id: "l", kind: "link", x: 100, y: 150, w: 100, h: 20, url: "https://example.com" },
      { ...base, id: "j", kind: "link", x: 100, y: 180, w: 100, h: 20, url: "javascript:alert(1)" },
      { ...base, id: "f", kind: "field", x: 100, y: 220, w: 150, h: 22, fieldType: "text", name: "full name", options: [], required: true },
      { ...base, id: "c", kind: "field", x: 100, y: 250, w: 14, h: 14, fieldType: "checkbox", name: "agree", options: [], required: false },
      { ...base, id: "s", kind: "field", x: 100, y: 280, w: 160, h: 40, fieldType: "signature", name: "sig", options: [], required: false },
    ];
    const out = await exportDocument(input([page("a", 0)], { a: objs }));
    const doc = await PDFDocument.load(out);
    const annots = doc.getPage(0).node.Annots();
    const subtypes = annots ? annots.asArray().map((r) => doc.context.lookup(r, PDFDict).get(PDFName.of("Subtype"))?.toString()) : [];
    expect(subtypes.filter((s) => s === "/Link")).toHaveLength(1); // javascript: link rejected
    expect(subtypes).toContain("/Text");
    const names = doc.getForm().getFields().map((f) => f.getName());
    expect(names).toEqual(expect.arrayContaining(["full_name", "agree"]));
  });

  it("fills existing form fields and can flatten them", async () => {
    const out = await exportDocument(input([page("a", 0, 0, 0, "s2")], {}, { formValues: { full_name: "Prabeen", subscribe: true, country: "Nepal" } }), { flattenForms: false });
    const f = (await PDFDocument.load(out)).getForm();
    expect(f.getTextField("full_name").getText()).toBe("Prabeen");
    expect(f.getCheckBox("subscribe").isChecked()).toBe(true);
    const flat = await exportDocument(input([page("a", 0, 0, 0, "s2")], {}, { formValues: { full_name: "Prabeen" } }), { flattenForms: true });
    expect((await PDFDocument.load(flat)).getForm().getFields()).toHaveLength(0);
    expect((await pdfText(flat))[0]).toContain("Prabeen");
  });

  it("uses the server redaction hook when provided", async () => {
    const red: EditorObject = { ...base, id: "r", kind: "redact", x: 50, y: 150, w: 200, h: 20, fill: "#000000" };
    let regions: unknown[] = [];
    const out = await exportDocument(input([page("a", 0)], { a: [red] }), { serverRedact: async (bytes, r) => { regions = r; return bytes; } });
    expect(regions).toHaveLength(1);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("duplicated pages", () => {
  it("duplicates the right page even after reordering", async () => {
    const out = await exportDocument(input([page("a", 1), page("b", 0), page("c", 0)]));
    const text = await pdfText(out);
    expect(text[0]).toContain("Page 2");
    expect(text[1]).toContain("Page 1");
    expect(text[2]).toContain("Page 1");
  });
});

describe("editing a sentence stored as one run per word", () => {
  it("removes every word of the line and keeps the other column", async () => {
    const words = fixture("words.pdf");
    const { pdfText: _t } = await import("./helpers");
    void _t;
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: words.slice() }).promise;
    const items = (await (await doc.getPage(1)).getTextContent()).items.filter((i) => "str" in i && i.str.trim() && i.transform[4] < 380) as { str: string; width: number; transform: number[] }[];
    const runs = items.map((i) => ({ x: i.transform[4], y: i.transform[5], dx: 1, dy: 0, width: i.width, size: 12 }));
    const edit: EditorObject = {
      ...base, ...defaultTextStyle, id: "e", kind: "textEdit", text: "The invoice total is 990 USD payable today.", x: 60, y: 130, w: 300, h: 16,
      cover: "#ffffff", strategy: "remove", original: { text: "", box: { x: 60, y: 130, w: 300, h: 14 }, fontName: "Helvetica", pdf: runs[0], pdfRuns: runs },
    };
    const sources = { w: { id: "w", name: "words.pdf", bytes: words, pageCount: 1 } };
    const out = await exportDocument({ docName: "w.pdf", sources, pages: [{ id: "a", sourceId: "w", sourceIndex: 0, rotation: 0, baseRotation: 0, width: 595.28, height: 841.89 }], objects: { a: [edit] }, assets: {}, formValues: {} });
    const [text] = await pdfText(out);
    expect(text).toContain("990 USD");
    expect(text).not.toContain("1,250");
    expect(text).toContain("Second column text");
  });
});
