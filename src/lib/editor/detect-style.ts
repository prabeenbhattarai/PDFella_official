/**
 * Work out how a run of original PDF text looks so an edit can reproduce it:
 * the font (reusing the PDF's own embedded font when it can draw the text),
 * weight, slant, size, colour and letter spacing.
 */
import type { OriginalStyle, PageRef, TextEditObject } from "./model";
import { ORIGINAL_STYLE_KEYS } from "./model";
import { getFontInfo, type TextRun } from "../pdf/docCache";
import { matchFont } from "../fonts/match";
import { facesFor, originalId, parseFont, isOriginal } from "../fonts/loader";
import { catalogFont, isBuiltin } from "../fonts/catalog";

export interface DetectedStyle {
  style: OriginalStyle;
  fontMatch: NonNullable<TextEditObject["fontMatch"]>;
}

/** Original fonts already stored as assets this session, by source + font name. */
const stored = new Map<string, string>();

function toDataUrl(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:font/otf;base64,${btoa(bin)}`;
}

export async function detectOriginalStyle(opts: {
  page: PageRef;
  run: TextRun;
  /** All runs of the line being edited. */
  group: TextRun[];
  color: string;
  assets: Record<string, string>;
  addAsset: (dataUrl: string) => string;
}): Promise<DetectedStyle> {
  const { page, run, group, color, assets, addAsset } = opts;
  const info = await getFontInfo(page, run.fontName);
  const m = matchFont(info.name, run.fontFamily, info);
  const size = Math.round(run.fontSize * 2) / 2;
  const base = { size, color, bold: m.bold, italic: m.italic, letterSpacing: 0 };

  let style: OriginalStyle = { ...base, font: m.id };
  let fonts = assets;
  let kind: DetectedStyle["fontMatch"]["kind"] = m.metric ? "metric" : "similar";

  // Reuse the embedded font if it really maps Unicode text to its glyphs.
  if (info.data) {
    const font = await parseFont(info.data);
    const sameFont = group.filter((r) => r.fontName === run.fontName).map((r) => r.str).join("");
    const chars = [...sameFont].filter((c) => !/\s/.test(c));
    const usable = !!font && chars.length > 0 && chars.every((c) => {
      const cp = c.codePointAt(0)!;
      return font.hasGlyphForCodePoint(cp) && font.glyphForCodePoint(cp).advanceWidth > 0;
    });
    if (usable) {
      const key = `${page.sourceId}|${info.name}`;
      let asset = stored.get(key);
      if (!asset || !assets[asset]) {
        const url = toDataUrl(info.data);
        asset = addAsset(url);
        stored.set(key, asset);
        fonts = { ...assets, [asset]: url };
      }
      style = { ...base, font: originalId(asset, m.bold, m.italic), fontFallback: isBuiltin(m.id) ? libraryTwin(m.id) : m.id };
      kind = "embedded";
    }
  }

  // Letter spacing: compare the run's real width with the font's natural width.
  if (kind !== "similar" && !isBuiltin(style.font)) {
    const faces = await facesFor(style, fonts);
    const glyphs = [...run.str];
    if (faces.length && glyphs.length >= 4) {
      let natural = 0;
      let ok = true;
      for (const ch of glyphs) {
        const cp = ch.codePointAt(0)!;
        const face = faces.find((f) => f.font.hasGlyphForCodePoint(cp));
        if (!face) { ok = false; break; }
        natural += (face.font.glyphForCodePoint(cp).advanceWidth / face.font.unitsPerEm) * size;
      }
      const ls = ok ? (run.pdf.width - natural) / (glyphs.length - 1) : 0;
      if (Math.abs(ls) > 0.08 && Math.abs(ls) < size * 0.3) style.letterSpacing = Math.round(ls * 20) / 20;
    }
  }

  return { style, fontMatch: { name: m.displayName, kind, fallbackMetric: m.metric } };
}

/** Library equivalent of a standard font, used for glyphs an embedded subset lacks. */
const libraryTwin = (id: string) => (id === "Times" ? "tinos" : id === "Courier" ? "cousine" : "arimo");

const near = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 0.05 : typeof a === "string" && typeof b === "string" ? a.toLowerCase() === b.toLowerCase() : a === b;

export type StyleDiff = { key: (typeof ORIGINAL_STYLE_KEYS)[number]; from: unknown; to: unknown };

/** How the edited text's look differs from the original text. */
export function styleDiff(o: TextEditObject): StyleDiff[] {
  if (!o.originalStyle) return [];
  const out: StyleDiff[] = [];
  for (const key of ORIGINAL_STYLE_KEYS) {
    if (key === "fontFallback") continue;
    const from = o.originalStyle[key], to = o[key];
    if (!near(from, to)) out.push({ key, from, to });
  }
  return out;
}

export const fontDisplayName = (id: string | undefined, o?: TextEditObject) =>
  !id ? "" : isOriginal(id) ? (o?.fontMatch?.name ?? "Original font") : (catalogFont(id)?.label ?? id);
