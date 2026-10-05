import { CATALOG } from "./catalog";

export interface FontMatch {
  /** Catalog font id. */
  id: string;
  /** True when the match has the same design/glyph widths as the PDF's font. */
  metric: boolean;
  bold: boolean;
  italic: boolean;
  /** Human-readable name of the PDF's font, e.g. "Times New Roman Bold". */
  displayName: string;
}

const STYLE_WORDS = /(semibold|demibold|extrabold|ultrabold|bold|black|heavy|medium|light|thin|regular|book|italic|oblique)$/;

/** "ABCDEF+TimesNewRomanPS-BoldItalicMT" → "timesnewroman". */
export function normaliseFontName(name: string): string {
  let base = name.replace(/^[A-Z]{6}\+/, "").split(/[-,_]/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  base = base.replace(/(psmt|mt|ps)$/, "");
  for (let i = 0; i < 3; i++) {
    const next = base.replace(STYLE_WORDS, "");
    if (next === base || !next) break;
    base = next.replace(/(psmt|mt|ps)$/, "");
  }
  return base;
}

/** "ABCDEF+TimesNewRomanPS-BoldItalicMT" → "Times New Roman Bold Italic". */
export function prettyFontName(name: string): string {
  const raw = name.replace(/^[A-Z]{6}\+/, "");
  const [family, ...rest] = raw.split(/[-,]/);
  const spaced = (s: string) => s.replace(/(PSMT|MT|PS)$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").trim();
  // Generator suffixes like "-9750" or "_123" carry no meaning for people.
  const style = spaced(rest.filter((t) => !/^\d+$/.test(t)).join(" ")).replace(/\bRegular\b/i, "").trim();
  return [spaced(family), style].filter(Boolean).join(" ") || raw;
}

export function styleFromName(name: string, flags: { bold?: boolean; black?: boolean; italic?: boolean } = {}) {
  const n = name.replace(/^[A-Z]{6}\+/, "").toLowerCase();
  return {
    bold: !!flags.bold || !!flags.black || /bold|black|heavy|semibold|demi/.test(n),
    italic: !!flags.italic || /italic|oblique|(-|,)it$/.test(n),
  };
}

/**
 * Closest catalog font for a PDF font name. `hint` is pdf.js's generic family
 * ("serif", "sans-serif", "monospace") when the name alone isn't recognised.
 */
export function matchFont(fontName: string, hint = "", flags: { bold?: boolean; black?: boolean; italic?: boolean } = {}): FontMatch {
  const base = normaliseFontName(fontName);
  const { bold, italic } = styleFromName(fontName, flags);
  const displayName = prettyFontName(fontName);

  let best: { id: string; alias: string; exact: boolean; metric: boolean } | null = null;
  for (const f of CATALOG) {
    for (const alias of f.match) {
      const exact = base === alias;
      if (!exact && !(base.startsWith(alias) && alias.length >= 4)) continue;
      if (!best || (exact && !best.exact) || (exact === best.exact && alias.length > best.alias.length)) {
        best = { id: f.id, alias, exact, metric: exact && !!f.metric };
      }
    }
  }
  if (best) return { id: best.id, metric: best.metric, bold, italic, displayName };

  const n = `${base} ${hint}`.toLowerCase();
  const id = /mono|courier|code|consol|typewriter/.test(n) ? "cousine"
    : /serif|roman|times|georgia|garamond|book|minion|cambria|caslon|baskerville|palatino|bodoni|didot/.test(n) && !/sans/.test(n) ? "tinos"
      : "arimo";
  return { id, metric: false, bold, italic, displayName };
}
