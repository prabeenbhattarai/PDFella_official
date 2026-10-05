import { describe, expect, it } from "vitest";
import { lineGroup, wordAt } from "@/lib/editor/text-lines";
import type { TextRun } from "@/lib/pdf/docCache";

const run = (str: string, x: number, w: number, y = 700): TextRun => ({
  str, box: { x, y: 841.89 - y - 10, w, h: 13 }, fontName: "f", fontFamily: "", fontSize: 12, angle: 0, origin: [x, 841.89 - y],
  pdf: { x, y, dx: 1, dy: 0, width: w, size: 12 },
});

describe("lineGroup", () => {
  const words = [run("The", 60, 22), run("invoice", 85, 40), run("total", 128, 26), run("Second", 400, 40), run("Below", 60, 30, 680)];
  it("joins neighbouring runs on the same baseline into one sentence", () => {
    const g = lineGroup(words, words[1]);
    expect(g.text).toBe("The invoice total");
    expect(g.runs).toHaveLength(3);
    expect(g.offsets).toEqual([0, 4, 12]);
  });
  it("never merges a separate column or another line", () => {
    expect(lineGroup(words, words[3]).text).toBe("Second");
    expect(lineGroup(words, words[4]).text).toBe("Below");
  });
});

describe("wordAt", () => {
  it("finds the word around an index", () => {
    expect(wordAt("The invoice total", 6)).toEqual([4, 11]);
    expect(wordAt("The invoice total", 0)).toEqual([0, 3]);
  });
});
