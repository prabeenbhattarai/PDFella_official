/**
 * True text removal from page content streams (browser, no server needed).
 *
 * We tokenize the page's content stream, interpret just enough of the graphics
 * and text state (q/Q, cm, BT/ET, Tm, Td, TD, T*, TL, Ts, ' and ") to know where each
 * text-showing operator starts in user space, and delete the operators that
 * start on a target run's baseline inside its extent.
 *
 * Positions are only "known" right after an explicit positioning operator; the
 * start of a show operator that follows another show operator depends on glyph
 * widths we don't compute, so such operators are only removed when they directly
 * continue an operator we already removed (pdf.js merges those into one run).
 * Everything else is left untouched — if nothing could be removed the caller
 * falls back to covering the text.
 *
 * Deletion edits the original bytes in place (tokens keep byte offsets), so no
 * string re-encoding is ever needed and unrelated content is preserved exactly.
 */
import { PDFArray, PDFDocument, PDFName, PDFPage, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from "pdf-lib";

type Tok = { t: "num" | "name" | "str" | "hex" | "op" | "arr" | "dict" | "other"; s: number; e: number; v?: number; op?: string };
type M = [number, number, number, number, number, number];

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

export function tokenize(b: Uint8Array): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = b.length;
  while (i < n) {
    const c = b[i];
    if (WS.has(c)) { i++; continue; }
    if (c === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; } // comment
    const s = i;
    if (c === 40) { // literal string with nesting and escapes
      let depth = 1; i++;
      while (i < n && depth) {
        if (b[i] === 92) i += 2;
        else { if (b[i] === 40) depth++; else if (b[i] === 41) depth--; i++; }
      }
      out.push({ t: "str", s, e: i });
      continue;
    }
    if (c === 60) {
      if (b[i + 1] === 60) { out.push({ t: "other", s, e: i + 2 }); i += 2; continue; }
      while (i < n && b[i] !== 62) i++;
      i++;
      out.push({ t: "hex", s, e: i });
      continue;
    }
    if (c === 62 && b[i + 1] === 62) { out.push({ t: "other", s, e: i + 2 }); i += 2; continue; }
    if (c === 91 || c === 93 || c === 123 || c === 125) { out.push({ t: "other", s, e: i + 1, op: String.fromCharCode(c) }); i++; continue; }
    if (c === 47) {
      i++;
      while (i < n && !WS.has(b[i]) && !DELIM.has(b[i])) i++;
      out.push({ t: "name", s, e: i });
      continue;
    }
    while (i < n && !WS.has(b[i]) && !DELIM.has(b[i])) i++;
    if (i === s) { i++; continue; }
    const word = String.fromCharCode(...b.subarray(s, i));
    const num = Number(word);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word) && Number.isFinite(num)) { out.push({ t: "num", s, e: i, v: num }); continue; }
    out.push({ t: "op", s, e: i, op: word });
    if (word === "ID") {
      // Inline image data: skip to "EI" surrounded by whitespace.
      let j = i + 1;
      while (j < n - 2 && !(WS.has(b[j]) && b[j + 1] === 69 && b[j + 2] === 73 && (j + 3 >= n || WS.has(b[j + 3])))) j++;
      out.push({ t: "other", s: i, e: j + 3 });
      i = j + 3;
    }
  }
  return out;
}

const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];
const I: M = [1, 0, 0, 1, 0, 0];

export interface RemovalTarget {
  /** Run start (baseline origin) in user space. */
  x: number; y: number;
  /** Run direction unit vector and length in user space. */
  dx: number; dy: number; width: number;
  size: number;
}

/**
 * Find byte ranges of show operators (with operands) matching the targets.
 * Returns ranges and, per target index, how many operators were matched.
 */
export function findTextOps(bytes: Uint8Array, targets: RemovalTarget[]): { ranges: [number, number][]; hits: number[] } {
  const toks = tokenize(bytes);
  const ranges: [number, number][] = [];
  const hits = targets.map(() => 0);
  let ctm: M = I;
  const stack: M[] = [];
  let tm: M = I, tlm: M = I, tl = 0, rise = 0, fontSize = 1;
  let known = false;
  let chainTarget = -1; // target index whose run we are currently continuing
  let operands: Tok[] = [];
  let opStart = -1;
  let arrDepth = 0;

  const nums = () => operands.filter((o) => o.t === "num").map((o) => o.v!);
  const matchStart = (): number => {
    const m = mul([1, 0, 0, 1, 0, rise], mul(tm, ctm));
    const px = m[4], py = m[5];
    for (let k = 0; k < targets.length; k++) {
      const t = targets[k];
      const rx = px - t.x, ry = py - t.y;
      const along = rx * t.dx + ry * t.dy;
      const across = -rx * t.dy + ry * t.dx;
      if (Math.abs(across) <= Math.max(0.6, t.size * 0.25) && along >= -Math.max(0.6, t.size * 0.2) && along <= t.width - t.size * 0.1) return k;
    }
    return -1;
  };

  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (tk.op === "[") arrDepth++;
    if (tk.op === "]") arrDepth--;
    if (tk.t !== "op" || arrDepth > 0) {
      if (opStart < 0) opStart = tk.s;
      operands.push(tk);
      continue;
    }
    const op = tk.op!;
    const start = opStart < 0 ? tk.s : opStart;
    const a = nums();
    switch (op) {
      case "q": stack.push(ctm); break;
      case "Q": ctm = stack.pop() ?? I; break;
      case "cm": if (a.length === 6) ctm = mul(a as M, ctm); break;
      case "BT": tm = I; tlm = I; known = true; chainTarget = -1; break;
      case "ET": known = false; chainTarget = -1; break;
      case "Tf": if (a.length) fontSize = a[a.length - 1]; break;
      case "TL": if (a.length) tl = a[0]; break;
      case "Ts": if (a.length) rise = a[0]; break;
      case "Td": if (a.length === 2) { tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; known = true; chainTarget = -1; } break;
      case "TD": if (a.length === 2) { tl = -a[1]; tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; known = true; chainTarget = -1; } break;
      case "Tm": if (a.length === 6) { tlm = a as M; tm = tlm; known = true; chainTarget = -1; } break;
      case "T*": tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; known = true; chainTarget = -1; break;
      case "'": case '"':
        tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; known = true; chainTarget = -1;
      // falls through
      case "Tj": case "TJ": {
        let target = -1;
        if (known) target = matchStart();
        else if (chainTarget >= 0) target = chainTarget;
        if (target >= 0) {
          if (op === "'" || op === '"') {
            // Keep the line advance (and word/char spacing for "), drop only the text.
            ranges.push([start, tk.e]);
            const advance = op === "'" ? " T* " : ` ${a[0]} Tw ${a[1]} Tc T* `;
            replacements.set(start, advance);
          } else ranges.push([start, tk.e]);
          hits[target]++;
          chainTarget = target;
        } else chainTarget = -1;
        known = false; // the next start depends on glyph widths
        break;
      }
    }
    void fontSize;
    operands = [];
    opStart = -1;
  }
  return { ranges, hits };
}

// Replacement text for removed ' and " operators (keyed by range start); module-level scratch reset per call.
let replacements = new Map<number, string>();

function applyRanges(bytes: Uint8Array, ranges: [number, number][]): Uint8Array {
  if (!ranges.length) return bytes;
  ranges.sort((x, y) => x[0] - y[0]);
  const parts: Uint8Array[] = [];
  let pos = 0;
  const enc = new TextEncoder();
  for (const [s, e] of ranges) {
    if (s < pos) continue;
    parts.push(bytes.subarray(pos, s));
    parts.push(enc.encode(replacements.get(s) ?? " "));
    pos = e;
  }
  parts.push(bytes.subarray(pos));
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function pageContentBytes(page: PDFPage): Uint8Array | null {
  const ctx = page.doc.context;
  const contents = page.node.get(PDFName.of("Contents"));
  const refs: unknown[] = [];
  const resolved = contents instanceof PDFRef ? ctx.lookup(contents) : contents;
  if (resolved instanceof PDFArray) for (let i = 0; i < resolved.size(); i++) refs.push(resolved.get(i));
  else if (contents) refs.push(contents);
  const chunks: Uint8Array[] = [];
  for (const r of refs) {
    const s = r instanceof PDFRef ? ctx.lookup(r) : r;
    if (s instanceof PDFRawStream) chunks.push(decodePDFRawStream(s).decode());
    else if (s instanceof PDFStream) chunks.push(s.getContents());
    else return null;
  }
  const len = chunks.reduce((n, c) => n + c.length + 1, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; out[o++] = 10; }
  return out;
}

/**
 * Remove text runs from a page's own content stream. Returns, per target,
 * whether at least one operator was removed. Must run before anything else is
 * drawn on the page (so pdf-lib's own appended streams are not involved).
 */
export function removeTextRuns(doc: PDFDocument, page: PDFPage, targets: RemovalTarget[]): boolean[] {
  if (!targets.length) return [];
  let bytes: Uint8Array | null;
  try { bytes = pageContentBytes(page); } catch { return targets.map(() => false); }
  if (!bytes) return targets.map(() => false);
  replacements = new Map();
  const { ranges, hits } = findTextOps(bytes, targets);
  if (!ranges.length) return targets.map(() => false);
  const next = applyRanges(bytes, ranges);
  const stream = doc.context.flateStream(next);
  page.node.set(PDFName.of("Contents"), doc.context.register(stream));
  return hits.map((h) => h > 0);
}
