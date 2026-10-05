import type { TextRun } from "../pdf/docCache";

/**
 * Expand a clicked run to the whole line/sentence it belongs to: runs on the same
 * baseline, same direction and similar size, joined while the gap between them is
 * small (so separate columns are never merged). Returns runs left-to-right, the
 * combined text, and each run's offset within that text.
 */
export function lineGroup(runs: TextRun[], seed: TextRun): { runs: TextRun[]; text: string; offsets: number[] } {
  if (seed.angle !== 0) return { runs: [seed], text: seed.str, offsets: [0] };
  const sameLine = runs
    .filter((r) => r.angle === 0 && Math.abs(r.pdf.y - seed.pdf.y) < seed.fontSize * 0.35 && Math.abs(r.fontSize - seed.fontSize) < seed.fontSize * 0.3)
    .sort((a, b) => a.box.x - b.box.x);
  const i = sameLine.indexOf(seed);
  if (i < 0) return { runs: [seed], text: seed.str, offsets: [0] };
  const maxGap = seed.fontSize * 1.1;
  let lo = i, hi = i;
  while (lo > 0 && sameLine[lo].box.x - (sameLine[lo - 1].box.x + sameLine[lo - 1].box.w) < maxGap) lo--;
  while (hi < sameLine.length - 1 && sameLine[hi + 1].box.x - (sameLine[hi].box.x + sameLine[hi].box.w) < maxGap) hi++;
  const group = sameLine.slice(lo, hi + 1);
  let text = "";
  const offsets: number[] = [];
  group.forEach((r, k) => {
    if (k > 0) {
      const gap = r.box.x - (group[k - 1].box.x + group[k - 1].box.w);
      if (gap > seed.fontSize * 0.12 && !text.endsWith(" ") && !r.str.startsWith(" ")) text += " ";
    }
    offsets.push(text.length);
    text += r.str;
  });
  return { runs: group, text, offsets };
}

/** Word boundaries around a character index. */
export function wordAt(text: string, idx: number): [number, number] {
  let a = Math.max(0, Math.min(idx, text.length - 1)), b = a;
  if (/\s/.test(text[a] ?? "")) return [a, a];
  while (a > 0 && !/\s/.test(text[a - 1])) a--;
  while (b < text.length && !/\s/.test(text[b])) b++;
  return [a, b];
}

