import { describe, expect, it } from "vitest";
import { toPdf, rectToPdf, rotatePt, wrapText, normalizeBox, intersects, baselineOffset, hexToRgb01, FONT_METRICS } from "@/lib/pdf/geometry";

const box = { x: 0, y: 0, width: 600, height: 800 };

describe("display → PDF coordinate mapping", () => {
  it("maps corners correctly for every rotation", () => {
    // Display top-left of a page shown with /Rotate r maps to these user-space points.
    expect(toPdf({ rotation: 0, box }, 0, 0)).toEqual([0, 800]);
    expect(toPdf({ rotation: 90, box }, 0, 0)).toEqual([0, 0]);
    expect(toPdf({ rotation: 180, box }, 0, 0)).toEqual([600, 0]);
    expect(toPdf({ rotation: 270, box }, 0, 0)).toEqual([600, 800]);
  });
  it("honours a non-zero crop box origin", () => {
    expect(toPdf({ rotation: 0, box: { x: 10, y: 20, width: 100, height: 100 } }, 5, 5)).toEqual([15, 115]);
  });
  it("produces axis-aligned rects with the right size on rotated pages", () => {
    const [, , w, h] = rectToPdf({ rotation: 90, box }, { x: 10, y: 20, w: 50, h: 30 });
    expect([w, h]).toEqual([30, 50]);
  });
});

describe("helpers", () => {
  it("rotates points clockwise in y-down space", () => {
    const [x, y] = rotatePt([1, 0], [0, 0], 90);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);
  });
  it("wraps text greedily and honours newlines", () => {
    const w = (s: string) => s.length;
    expect(wrapText("aaa bbb ccc", 7, w)).toEqual(["aaa bbb", "ccc"]);
    expect(wrapText("one\ntwo", 100, w)).toEqual(["one", "two"]);
    expect(wrapText("abcdefghij", 4, w)).toEqual(["abcd", "efgh", "ij"]);
  });
  it("normalises and intersects boxes", () => {
    const b = normalizeBox(10, 10, 0, 0);
    expect(b).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(intersects(b, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(intersects(b, { x: 11, y: 0, w: 1, h: 1 })).toBe(false);
  });
  it("computes baselines like CSS line boxes", () => {
    expect(baselineOffset(FONT_METRICS.Helvetica, 10, 1, 1)).toBeGreaterThan(baselineOffset(FONT_METRICS.Helvetica, 10, 1, 0));
  });
  it("parses hex colours", () => {
    expect(hexToRgb01("#ff0000")).toEqual([1, 0, 0]);
    expect(hexToRgb01("#0f0")).toEqual([0, 1, 0]);
  });
});
