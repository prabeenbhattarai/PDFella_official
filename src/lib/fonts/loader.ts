/**
 * Browser-side font handling shared by the editor (display) and export (embedding):
 * registers FontFaces, measures vertical metrics exactly as CSS lays text out, and
 * answers "which font has a glyph for this character" so saved PDFs use the same
 * per-character fallback as the browser.
 *
 * Font ids:
 *   "Helvetica" | "Times" | "Courier"  standard PDF fonts
 *   "<catalog id>"                     library font in /public/fonts/<id>/
 *   "orig:<assetId>:<b><i>"            font embedded in the user's PDF, stored as an asset
 */
import type { Font as FkFont } from "@pdf-lib/fontkit";
import { catalogFont, hasLatinExt, isBuiltin, stylesOf, variantOf, type Variant } from "./catalog";
import { FONT_METRICS } from "../pdf/geometry";

export interface FontRef { font: string; fontFallback?: string; bold: boolean; italic: boolean }
export interface Metrics { ascent: number; descent: number }

const BUILTIN_CSS: Record<string, string> = {
  Helvetica: "Helvetica, Arial, 'Liberation Sans', sans-serif",
  Times: "'Times New Roman', Times, 'Liberation Serif', serif",
  Courier: "'Courier New', Courier, 'Liberation Mono', monospace",
};
const GENERIC: Record<string, string> = { serif: "serif", mono: "monospace", script: "cursive" };

// Unicode ranges of the Fontsource "latin" and "latin-ext" subsets.
const LATIN = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT = "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

export const isOriginal = (id: string) => id.startsWith("orig:");
export function parseOriginal(id: string) {
  const [, asset, flags = "00"] = id.split(":");
  return { asset, bold: flags[0] === "1", italic: flags[1] === "1" };
}
export const originalId = (asset: string, bold: boolean, italic: boolean) => `orig:${asset}:${bold ? 1 : 0}${italic ? 1 : 0}`;

const cssName = (id: string) => (isOriginal(id) ? `pdfella-orig-${parseOriginal(id).asset}` : `PDFella ${catalogFont(id)?.label ?? id}`);

/** CSS font-family stack for a text style. */
export function fontStack(f: Pick<FontRef, "font" | "fontFallback">): string {
  const one = (id: string | undefined): string[] => {
    if (!id) return [];
    if (isBuiltin(id)) return [BUILTIN_CSS[id]];
    return [`"${cssName(id)}"`];
  };
  const def = catalogFont(f.fontFallback ?? f.font);
  const cat = def?.generic ?? def?.category ?? "sans";
  return [...one(f.font), ...one(f.fontFallback), GENERIC[cat] ?? "sans-serif"].join(", ");
}

/** Closest style a library font actually ships; the rest is synthesised. */
export function resolveVariant(id: string, bold: boolean, italic: boolean): { variant: Variant; fauxBold: boolean; fauxItalic: boolean } {
  if (isOriginal(id)) {
    const o = parseOriginal(id);
    return { variant: variantOf(o.bold, o.italic), fauxBold: bold && !o.bold, fauxItalic: italic && !o.italic };
  }
  const styles = stylesOf(id);
  const want = variantOf(bold, italic);
  if (styles.includes(want)) return { variant: want, fauxBold: false, fauxItalic: false };
  const v = [variantOf(bold, false), variantOf(false, italic), "400-normal" as Variant].find((x) => styles.includes(x)) ?? "400-normal";
  return { variant: v, fauxBold: bold && !v.startsWith("700"), fauxItalic: italic && !v.endsWith("italic") };
}

// ───────────────────────────── bytes

const bytesCache = new Map<string, Promise<Uint8Array | null>>();

/** Raw font file bytes. `assets` resolves original fonts (data URLs in the editor store). */
export function fontBytes(id: string, variant: Variant, subset: "latin" | "latin-ext", assets: Record<string, string>): Promise<Uint8Array | null> {
  const key = isOriginal(id) ? id : `${id}/${variant}-${subset}`;
  let p = bytesCache.get(key);
  if (!p) {
    p = (async () => {
      if (isOriginal(id)) {
        const url = assets[parseOriginal(id).asset];
        if (!url) return null;
        return new Uint8Array(await (await fetch(url)).arrayBuffer());
      }
      if (subset === "latin-ext" && !hasLatinExt(id)) return null;
      const r = await fetch(`/fonts/${id}/${variant}-${subset}.woff`);
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    })().catch(() => null);
    bytesCache.set(key, p);
  }
  return p;
}

export interface Fontkit { create(bytes: Uint8Array): FkFont }
let fontkitPromise: Promise<Fontkit> | null = null;
/** fontkit is large: loaded on first use (the UMD build exposes it as default or as the module). */
export const loadFontkit = () => (fontkitPromise ??= import("@pdf-lib/fontkit").then((m) => ((m as unknown as { default?: Fontkit }).default ?? (m as unknown as Fontkit))));

const parsed = new Map<Uint8Array, FkFont | null>();
export async function parseFont(bytes: Uint8Array): Promise<FkFont | null> {
  if (!parsed.has(bytes)) {
    const fk = await loadFontkit();
    try { parsed.set(bytes, fk.create(bytes)); } catch { parsed.set(bytes, null); }
  }
  return parsed.get(bytes)!;
}

// ───────────────────────────── faces (in order of fallback)

export interface Face {
  /** Font id this face belongs to. */
  id: string;
  variant: Variant;
  subset: "latin" | "latin-ext";
  bytes: Uint8Array;
  font: FkFont;
  fauxBold: boolean;
  fauxItalic: boolean;
}

/** Faces used to render a style, in fallback order (same order CSS uses). Built-ins have none. */
export async function facesFor(ref: FontRef, assets: Record<string, string>): Promise<Face[]> {
  const out: Face[] = [];
  for (const id of [ref.font, ref.fontFallback]) {
    if (!id || isBuiltin(id)) continue;
    const { variant, fauxBold, fauxItalic } = resolveVariant(id, ref.bold, ref.italic);
    for (const subset of isOriginal(id) ? (["latin"] as const) : (["latin", "latin-ext"] as const)) {
      const bytes = await fontBytes(id, variant, subset, assets);
      const font = bytes && (await parseFont(bytes));
      if (bytes && font) out.push({ id, variant, subset, bytes, font, fauxBold, fauxItalic });
    }
  }
  return out;
}

/** Characters (as a de-duplicated string) that none of the faces can draw. */
export function missingChars(faces: Face[], text: string): string {
  const miss = new Set<string>();
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    const cp = ch.codePointAt(0)!;
    if (!faces.some((f) => f.font.hasGlyphForCodePoint(cp))) miss.add(ch);
  }
  return [...miss].join("");
}

// ───────────────────────────── display

const registered = new Map<string, Promise<void>>();

/** Make a font usable in CSS. Resolves when it has loaded (or failed). */
export function ensureFont(id: string | undefined, bold: boolean, italic: boolean, assets: Record<string, string>): Promise<void> {
  if (!id || isBuiltin(id) || typeof document === "undefined") return Promise.resolve();
  const { variant } = resolveVariant(id, bold, italic);
  const key = isOriginal(id) ? id : `${id}/${variant}`;
  let p = registered.get(key);
  if (!p) {
    p = (async () => {
      const [w, style] = variant.split("-");
      const desc: FontFaceDescriptors = { weight: w, style };
      const faces: FontFace[] = [];
      if (isOriginal(id)) {
        const bytes = await fontBytes(id, variant, "latin", assets);
        if (bytes) faces.push(new FontFace(cssName(id), bytes.slice().buffer as ArrayBuffer, desc));
      } else {
        faces.push(new FontFace(cssName(id), `url(/fonts/${id}/${variant}-latin.woff) format("woff")`, { ...desc, unicodeRange: LATIN }));
        if (hasLatinExt(id)) faces.push(new FontFace(cssName(id), `url(/fonts/${id}/${variant}-latin-ext.woff) format("woff")`, { ...desc, unicodeRange: LATIN_EXT }));
      }
      for (const f of faces) {
        document.fonts.add(f);
        await f.load().catch(() => undefined);
      }
    })();
    registered.set(key, p);
  }
  return p;
}

export const ensureStyleFonts = (ref: FontRef, assets: Record<string, string>) =>
  Promise.all([ensureFont(ref.font, ref.bold, ref.italic, assets), ensureFont(ref.fontFallback, ref.bold, ref.italic, assets)]).then(() => undefined);

const metricsCache = new Map<string, Metrics>();

/**
 * Ascent/descent (in em) that CSS uses for the line box. Measured from the browser
 * itself so exported baselines match what the user saw. Call ensureStyleFonts first.
 */
export function fontMetrics(ref: Pick<FontRef, "font" | "fontFallback" | "bold" | "italic">): Metrics {
  if (isBuiltin(ref.font)) return FONT_METRICS[ref.font];
  const key = `${ref.font}|${ref.fontFallback}|${ref.bold}|${ref.italic}`;
  const hit = metricsCache.get(key);
  if (hit) return hit;
  const fallback = FONT_METRICS.Helvetica;
  if (typeof document === "undefined") return fallback;
  const g = document.createElement("canvas").getContext("2d");
  if (!g) return fallback;
  g.font = `${ref.italic ? "italic " : ""}${ref.bold ? "700 " : ""}100px ${fontStack(ref)}`;
  const m = g.measureText("Hg");
  if (!m.fontBoundingBoxAscent) return fallback;
  const out = { ascent: m.fontBoundingBoxAscent / 100, descent: m.fontBoundingBoxDescent / 100 };
  if (document.fonts.check(g.font)) metricsCache.set(key, out);
  return out;
}

/** Human label for a font id. */
export function fontLabel(id: string, originalNames: Record<string, string> = {}): string {
  if (isOriginal(id)) return originalNames[id] ?? "Original font";
  return catalogFont(id)?.label ?? id;
}
