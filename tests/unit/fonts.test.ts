import { describe, expect, it } from "vitest";
import { matchFont, normaliseFontName, prettyFontName } from "@/lib/fonts/match";
import { resolveVariant, fontStack, originalId, parseOriginal } from "@/lib/fonts/loader";
import { CATALOG, stylesOf } from "@/lib/fonts/catalog";

describe("font matching", () => {
  it("normalises PostScript names", () => {
    expect(normaliseFontName("ABCDEF+TimesNewRomanPS-BoldItalicMT")).toBe("timesnewroman");
    expect(normaliseFontName("ArialMT")).toBe("arial");
    expect(normaliseFontName("Calibri,Bold")).toBe("calibri");
    expect(normaliseFontName("ArialBold")).toBe("arial");
  });

  it("maps common document fonts to metric-compatible twins", () => {
    expect(matchFont("ABCDEF+Calibri-Bold")).toMatchObject({ id: "carlito", metric: true, bold: true, italic: false });
    expect(matchFont("ArialMT")).toMatchObject({ id: "arimo", metric: true });
    expect(matchFont("TimesNewRomanPS-ItalicMT")).toMatchObject({ id: "tinos", metric: true, italic: true });
    expect(matchFont("CourierNewPSMT")).toMatchObject({ id: "cousine", metric: true });
    expect(matchFont("Cambria")).toMatchObject({ id: "caladea", metric: true });
    expect(matchFont("Georgia-Bold")).toMatchObject({ id: "gelasio", metric: true, bold: true });
    expect(matchFont("Helvetica-Oblique")).toMatchObject({ id: "Helvetica", metric: true, italic: true });
    expect(matchFont("Times-Roman")).toMatchObject({ id: "Times", metric: true });
  });

  it("uses a similar design (not metric) for lookalikes and unknown fonts", () => {
    expect(matchFont("SegoeUI")).toMatchObject({ id: "open-sans", metric: false });
    expect(matchFont("ArialNarrow")).toMatchObject({ id: "arimo", metric: false });
    expect(matchFont("MinionPro-It")).toMatchObject({ id: "crimson-text", italic: true });
    expect(matchFont("XYZCorpSerif", "serif").id).toBe("tinos");
    expect(matchFont("Mystery", "monospace").id).toBe("cousine");
    expect(matchFont("Mystery").id).toBe("arimo");
  });

  it("produces readable names", () => {
    expect(prettyFontName("ABCDEF+TimesNewRomanPS-BoldItalicMT")).toBe("Times New Roman Bold Italic");
    expect(prettyFontName("Calibri-Bold")).toBe("Calibri Bold");
    expect(prettyFontName("ABCDEF+Carlito-Bold-9750")).toBe("Carlito Bold");
  });
});

describe("font catalog & styles", () => {
  it("every catalog font has a regular style and a unique id", () => {
    expect(new Set(CATALOG.map((f) => f.id)).size).toBe(CATALOG.length);
    for (const f of CATALOG) expect(stylesOf(f.id)).toContain("400-normal");
  });

  it("synthesises styles a family doesn't ship", () => {
    expect(resolveVariant("arimo", true, true)).toEqual({ variant: "700-italic", fauxBold: false, fauxItalic: false });
    expect(resolveVariant("oswald", false, true)).toEqual({ variant: "400-normal", fauxBold: false, fauxItalic: true });
    expect(resolveVariant("bebas-neue", true, false)).toEqual({ variant: "400-normal", fauxBold: true, fauxItalic: false });
  });

  it("original fonts never synthesise the style they already have", () => {
    const id = originalId("a_1", true, false);
    expect(parseOriginal(id)).toEqual({ asset: "a_1", bold: true, italic: false });
    expect(resolveVariant(id, true, false)).toMatchObject({ fauxBold: false, fauxItalic: false });
    expect(resolveVariant(id, true, true)).toMatchObject({ fauxBold: false, fauxItalic: true });
  });

  it("builds a CSS stack with the fallback font", () => {
    expect(fontStack({ font: originalId("a_1", false, false), fontFallback: "carlito" })).toBe('"pdfella-orig-a_1", "PDFella Carlito", sans-serif');
    expect(fontStack({ font: "tinos" })).toBe('"PDFella Tinos", serif');
  });
});
