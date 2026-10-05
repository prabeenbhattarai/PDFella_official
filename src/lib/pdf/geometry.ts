/**
 * Pure geometry shared by the editor and the exporter.
 *
 * "Display space": points, origin top-left of the page *as shown* (after /Rotate).
 * "PDF space":     points, origin bottom-left of the unrotated crop box.
 */
import type { Box } from "../editor/model";

export type Pt = [number, number];

export interface PageFrame {
  /** Total rotation, one of 0/90/180/270 (clockwise, like /Rotate). */
  rotation: number;
  /** Unrotated crop box. */
  box: { x: number; y: number; width: number; height: number };
}

/** Display point → PDF user-space point. */
export function toPdf(frame: PageFrame, dx: number, dy: number): Pt {
  const { x: ox, y: oy, width: W, height: H } = frame.box;
  switch (frame.rotation) {
    case 90: return [ox + dy, oy + dx];
    case 180: return [ox + W - dx, oy + dy];
    case 270: return [ox + W - dy, oy + H - dx];
    default: return [ox + dx, oy + H - dy];
  }
}

/** Display-space rectangle → axis-aligned PDF rect [x, y, w, h]. */
export function rectToPdf(frame: PageFrame, b: Box): [number, number, number, number] {
  const a = toPdf(frame, b.x, b.y);
  const c = toPdf(frame, b.x + b.w, b.y + b.h);
  return [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.abs(c[0] - a[0]), Math.abs(c[1] - a[1])];
}

/** Rotate p clockwise (visually, y-down) by deg around c. */
export function rotatePt(p: Pt, c: Pt, deg: number): Pt {
  if (!deg) return p;
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * cos - dy * sin, c[1] + dx * sin + dy * cos];
}

/** Maps box-local coordinates (0..w, 0..h) into display space, applying the box rotation. */
export function boxTransform(b: Box & { rotation?: number }) {
  const c: Pt = [b.x + b.w / 2, b.y + b.h / 2];
  const rot = b.rotation ?? 0;
  return (lx: number, ly: number): Pt => rotatePt([b.x + lx, b.y + ly], c, rot);
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** A tiny path builder that emits SVG path data after applying a point transform. */
export class PathBuilder {
  private d: string[] = [];
  constructor(private tf: (x: number, y: number) => Pt = (x, y) => [x, y]) {}
  private p(x: number, y: number) {
    const [a, b] = this.tf(x, y);
    return `${f(a)} ${f(b)}`;
  }
  M(x: number, y: number) { this.d.push(`M${this.p(x, y)}`); return this; }
  L(x: number, y: number) { this.d.push(`L${this.p(x, y)}`); return this; }
  C(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    this.d.push(`C${this.p(x1, y1)} ${this.p(x2, y2)} ${this.p(x, y)}`);
    return this;
  }
  Q(x1: number, y1: number, x: number, y: number) { this.d.push(`Q${this.p(x1, y1)} ${this.p(x, y)}`); return this; }
  Z() { this.d.push("Z"); return this; }
  toString() { return this.d.join(" "); }
}

const K = 0.5522847498;

export function rectPath(pb: PathBuilder, w: number, h: number) {
  return pb.M(0, 0).L(w, 0).L(w, h).L(0, h).Z();
}

export function roundedRectPath(pb: PathBuilder, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  const k = r * K;
  return pb
    .M(r, 0).L(w - r, 0).C(w - r + k, 0, w, r - k, w, r)
    .L(w, h - r).C(w, h - r + k, w - r + k, h, w - r, h)
    .L(r, h).C(r - k, h, 0, h - r + k, 0, h - r)
    .L(0, r).C(0, r - k, r - k, 0, r, 0).Z();
}

export function ellipsePath(pb: PathBuilder, w: number, h: number) {
  const rx = w / 2, ry = h / 2, cx = rx, cy = ry;
  const kx = rx * K, ky = ry * K;
  return pb
    .M(cx + rx, cy)
    .C(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry)
    .C(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy)
    .C(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry)
    .C(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy)
    .Z();
}

/** Scalloped "cloud" outline around a rectangle. */
export function cloudPath(pb: PathBuilder, w: number, h: number) {
  const bump = Math.max(8, Math.min(w, h) / 6);
  const edge = (x0: number, y0: number, x1: number, y1: number, first: boolean) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / bump));
    const nx = (y1 - y0) / len, ny = -(x1 - x0) / len; // outward normal for clockwise traversal
    if (first) pb.M(x0, y0);
    for (let i = 0; i < n; i++) {
      const ax = x0 + ((x1 - x0) * i) / n, ay = y0 + ((y1 - y0) * i) / n;
      const bx = x0 + ((x1 - x0) * (i + 1)) / n, by = y0 + ((y1 - y0) * (i + 1)) / n;
      const mx = (ax + bx) / 2 + nx * (len / n) * 0.45, my = (ay + by) / 2 + ny * (len / n) * 0.45;
      pb.Q(mx, my, bx, by);
    }
  };
  edge(0, 0, w, 0, true);
  edge(w, 0, w, h, false);
  edge(w, h, 0, h, false);
  edge(0, h, 0, 0, false);
  return pb.Z();
}

export function polygonPath(pb: PathBuilder, pts: [number, number][], w: number, h: number) {
  pts.forEach(([x, y], i) => (i === 0 ? pb.M(x * w, y * h) : pb.L(x * w, y * h)));
  return pb.Z();
}

export function starPoints(n = 5, inner = 0.42): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.5 * inner;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a) + 0.04]);
  }
  return pts;
}

export function checkPath(pb: PathBuilder, w: number, h: number) {
  return pb.M(w * 0.12, h * 0.55).L(w * 0.4, h * 0.82).L(w * 0.9, h * 0.2);
}

export function crossPath(pb: PathBuilder, w: number, h: number) {
  return pb.M(w * 0.18, h * 0.18).L(w * 0.82, h * 0.82).M(w * 0.82, h * 0.18).L(w * 0.18, h * 0.82);
}

/** Arrow head triangle at (x2,y2) pointing away from (x1,y1), in display space. */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, strokeWidth: number): Pt[] {
  const len = Math.max(8, strokeWidth * 4.5);
  const a = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  return [
    [x2, y2],
    [x2 - len * Math.cos(a - spread), y2 - len * Math.sin(a - spread)],
    [x2 - len * Math.cos(a + spread), y2 - len * Math.sin(a + spread)],
  ];
}

/** Smooth a freehand stroke into quadratic segments (midpoint technique). */
export function smoothStroke(pb: PathBuilder, pts: Pt[]) {
  if (!pts.length) return pb;
  pb.M(pts[0][0], pts[0][1]);
  if (pts.length === 1) return pb.L(pts[0][0] + 0.01, pts[0][1] + 0.01);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    pb.Q(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  return pb.L(last[0], last[1]);
}

export function intersects(a: Box, b: Box) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function normalizeBox(x1: number, y1: number, x2: number, y2: number): Box {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

/** Font metrics used to match the browser's line box when exporting text (Arial/Times New Roman/Courier New). */
export const FONT_METRICS = {
  Helvetica: { ascent: 0.905, descent: 0.212 },
  Times: { ascent: 0.891, descent: 0.216 },
  Courier: { ascent: 0.833, descent: 0.3 },
} as const;

/** Baseline offset of line i from the box top, matching CSS line-height layout. */
export function baselineOffset(font: keyof typeof FONT_METRICS, size: number, lineHeight: number, i: number) {
  const m = FONT_METRICS[font];
  const lh = size * lineHeight;
  return i * lh + (lh - (m.ascent + m.descent) * size) / 2 + m.ascent * size;
}

/** Greedy word wrap using a width function; honours explicit newlines and breaks long words. */
export function wrapText(text: string, maxWidth: number, width: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para) { out.push(""); continue; }
    const words = para.split(/(\s+)/);
    let line = "";
    for (const token of words) {
      const candidate = line + token;
      if (width(candidate) <= maxWidth || !line) {
        if (!line && width(token) > maxWidth && token.trim()) {
          // Break an over-long word character by character.
          let chunk = "";
          for (const ch of token) {
            if (width(chunk + ch) > maxWidth && chunk) { out.push(chunk); chunk = ch; } else chunk += ch;
          }
          line = chunk;
        } else line = candidate;
      } else {
        out.push(line.trimEnd());
        line = token.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const n = parseInt(full.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
