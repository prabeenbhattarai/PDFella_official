import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { tokenize, findTextOps, removeTextRuns } from "@/lib/pdf/content-edit";
import { pdfText } from "./helpers";

const enc = (s: string) => new TextEncoder().encode(s);

describe("content stream tokenizer", () => {
  it("handles strings with escapes and nesting, hex strings, arrays and inline images", () => {
    const toks = tokenize(enc("BT /F1 12 Tf (a\\)b (c)) Tj <414243> Tj [(x) -20 (y)] TJ ET BI /W 1 ID \x00\xff EI Q"));
    const ops = toks.filter((t) => t.t === "op").map((t) => t.op);
    expect(ops).toEqual(["BT", "Tf", "Tj", "Tj", "TJ", "ET", "BI", "ID", "Q"]);
  });
});

describe("findTextOps", () => {
  it("matches the show operator at a run origin and leaves others", () => {
    const stream = enc("BT /F1 12 Tf 1 0 0 1 72 700 Tm (Keep me) Tj 1 0 0 1 72 680 Tm (Remove me) Tj ET");
    const { ranges, hits } = findTextOps(stream, [{ x: 72, y: 680, dx: 1, dy: 0, width: 60, size: 12 }]);
    expect(hits).toEqual([1]);
    expect(ranges).toHaveLength(1);
    const removed = new TextDecoder().decode(stream.subarray(ranges[0][0], ranges[0][1]));
    expect(removed).toBe("(Remove me) Tj");
  });
  it("respects the CTM", () => {
    const stream = enc("q 1 0 0 1 100 100 cm BT 1 0 0 1 0 0 Tm (X) Tj ET Q");
    expect(findTextOps(stream, [{ x: 100, y: 100, dx: 1, dy: 0, width: 10, size: 12 }]).hits).toEqual([1]);
  });
  it("never removes an operator whose start position is unknown", () => {
    // Second Tj follows the first without repositioning: its x depends on glyph widths.
    const stream = enc("BT 1 0 0 1 72 700 Tm (First) Tj (Second) Tj ET");
    const { hits } = findTextOps(stream, [{ x: 140, y: 700, dx: 1, dy: 0, width: 50, size: 12 }]);
    expect(hits).toEqual([0]);
  });
});

describe("removeTextRuns on a real PDF", () => {
  it("deletes only the targeted line", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 400]);
    page.drawText("Line one stays", { x: 50, y: 300, size: 12, font });
    page.drawText("Line two goes", { x: 50, y: 280, size: 12, font });
    const loaded = await PDFDocument.load(await doc.save());
    const p = loaded.getPage(0);
    const ok = removeTextRuns(loaded, p, [{ x: 50, y: 280, dx: 1, dy: 0, width: font.widthOfTextAtSize("Line two goes", 12), size: 12 }]);
    expect(ok).toEqual([true]);
    const [text] = await pdfText(await loaded.save());
    expect(text).toContain("Line one stays");
    expect(text).not.toContain("Line two goes");
  });
});
