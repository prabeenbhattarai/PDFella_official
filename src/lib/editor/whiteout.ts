import type { Box, PageRef, PdfRun } from "./model";
import { getTextRuns, type TextRun } from "../pdf/docCache";

/**
 * Text-only whiteout: which original text runs a box removes. PDF text can only be
 * deleted a whole run (word or line) at a time, so a run counts when the box covers
 * at least 30% of it; the caller can grow the box to show exactly what goes.
 */
export function runsUnder(runs: TextRun[], b: Box): TextRun[] {
  return runs.filter((r) => {
    if (r.angle % 180 !== 0) return false;
    const w = Math.min(r.box.x + r.box.w, b.x + b.w) - Math.max(r.box.x, b.x);
    const h = Math.min(r.box.y + r.box.h, b.y + b.h) - Math.max(r.box.y, b.y);
    return w > 0 && h > 0 && (w * h) / Math.max(1, r.box.w * r.box.h) >= 0.3;
  });
}

export function unionBox(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** Original text runs under a box on a page (for re-targeting after a move or resize). */
export async function textRunsIn(page: PageRef, b: Box): Promise<PdfRun[]> {
  return runsUnder(await getTextRuns(page).catch(() => []), b).map((r) => r.pdf);
}
