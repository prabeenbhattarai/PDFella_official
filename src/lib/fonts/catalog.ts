/**
 * Fonts available in the editor.
 *
 *  - Built-in: the PDF standard fonts. Never downloaded or embedded.
 *  - Library: open-licence families (SIL OFL / Apache) served from /public/fonts
 *    (copied by `npm run fonts`) and embedded, subset, into saved PDFs.
 *  - Original fonts embedded in the user's PDF are added at runtime ("orig:" ids).
 *
 * `match` lists normalised PDF font names (see normaliseFontName) a family stands
 * in for. `metric: true` means the family has the same glyph widths as those fonts
 * (or is the same design), so replaced text lines up exactly.
 */
import available from "./available.json";

export type FontCategory = "builtin" | "document" | "sans" | "serif" | "mono" | "display" | "script";

export interface CatalogFont {
  id: string;
  label: string;
  category: FontCategory;
  /** Shown next to the name, e.g. "like Arial". */
  like?: string;
  match: string[];
  metric?: boolean;
  /** CSS generic family for the last-resort fallback, when the category doesn't say. */
  generic?: "serif" | "mono";
}

export const CATEGORY_LABELS: Record<FontCategory, string> = {
  builtin: "Standard PDF fonts",
  document: "Matches for common document fonts",
  sans: "Sans serif",
  serif: "Serif",
  mono: "Monospace",
  display: "Display",
  script: "Handwriting & script",
};

export const CATALOG: CatalogFont[] = [
  { id: "Helvetica", label: "Helvetica", category: "builtin", match: ["helvetica", "helveticaneue", "nimbussans", "nimbussanl", "freesans", "texgyreheros"], metric: true },
  { id: "Times", label: "Times", category: "builtin", match: ["times", "timesroman", "nimbusroman", "nimbusromno9l", "freeserif", "texgyretermes"], metric: true },
  { id: "Courier", label: "Courier", category: "builtin", match: ["courier", "nimbusmono", "nimbusmonl", "freemono", "texgyrecursor"], metric: true },

  { id: "arimo", label: "Arimo", category: "document", like: "Arial", match: ["arial", "arialmt", "liberationsans", "arimo"], metric: true },
  { id: "tinos", label: "Tinos", category: "document", like: "Times New Roman", match: ["timesnewroman", "timesnewromanps", "liberationserif", "tinos"], metric: true, generic: "serif" },
  { id: "cousine", label: "Cousine", category: "document", like: "Courier New", match: ["couriernew", "couriernewps", "liberationmono", "cousine"], metric: true, generic: "mono" },
  { id: "carlito", label: "Carlito", category: "document", like: "Calibri", match: ["calibri", "carlito"], metric: true },
  { id: "caladea", label: "Caladea", category: "document", like: "Cambria", match: ["cambria", "caladea"], metric: true, generic: "serif" },
  { id: "gelasio", label: "Gelasio", category: "document", like: "Georgia", match: ["georgia", "gelasio"], metric: true, generic: "serif" },

  { id: "inter", label: "Inter", category: "sans", match: ["inter"], metric: true },
  { id: "roboto", label: "Roboto", category: "sans", match: ["roboto"], metric: true },
  { id: "open-sans", label: "Open Sans", category: "sans", match: ["opensans", "segoeui", "segoe"] },
  { id: "lato", label: "Lato", category: "sans", match: ["lato"], metric: true },
  { id: "montserrat", label: "Montserrat", category: "sans", match: ["montserrat", "gotham", "proximanova"] },
  { id: "poppins", label: "Poppins", category: "sans", match: ["poppins"], metric: true },
  { id: "source-sans-3", label: "Source Sans 3", category: "sans", match: ["sourcesans3", "sourcesanspro", "sourcesans"], metric: true },
  { id: "noto-sans", label: "Noto Sans", category: "sans", match: ["notosans", "verdana", "tahoma", "dejavusans"] },
  { id: "raleway", label: "Raleway", category: "sans", match: ["raleway"], metric: true },
  { id: "nunito", label: "Nunito", category: "sans", match: ["nunito", "avenir", "avenirnext"] },
  { id: "work-sans", label: "Work Sans", category: "sans", match: ["worksans"], metric: true },
  { id: "ubuntu", label: "Ubuntu", category: "sans", match: ["ubuntu"], metric: true },
  { id: "pt-sans", label: "PT Sans", category: "sans", match: ["ptsans"], metric: true },
  { id: "fira-sans", label: "Fira Sans", category: "sans", match: ["firasans"], metric: true },
  { id: "dm-sans", label: "DM Sans", category: "sans", match: ["dmsans"], metric: true },
  { id: "barlow", label: "Barlow", category: "sans", match: ["barlow"], metric: true },
  { id: "oswald", label: "Oswald", category: "sans", match: ["oswald"], metric: true },
  { id: "rubik", label: "Rubik", category: "sans", match: ["rubik"], metric: true },
  { id: "mulish", label: "Mulish", category: "sans", match: ["mulish"], metric: true },
  { id: "ibm-plex-sans", label: "IBM Plex Sans", category: "sans", match: ["ibmplexsans", "plexsans"], metric: true },
  { id: "karla", label: "Karla", category: "sans", match: ["karla"], metric: true },
  { id: "manrope", label: "Manrope", category: "sans", match: ["manrope"], metric: true },
  { id: "quicksand", label: "Quicksand", category: "sans", match: ["quicksand", "centurygothic"] },

  { id: "merriweather", label: "Merriweather", category: "serif", match: ["merriweather"], metric: true },
  { id: "playfair-display", label: "Playfair Display", category: "serif", match: ["playfairdisplay", "playfair", "didot", "bodoni"] },
  { id: "lora", label: "Lora", category: "serif", match: ["lora"], metric: true },
  { id: "eb-garamond", label: "EB Garamond", category: "serif", match: ["ebgaramond", "garamond", "adobegaramond", "adobegaramondpro", "garamondpremrpro", "garamondpremierpro"] },
  { id: "libre-baskerville", label: "Libre Baskerville", category: "serif", match: ["librebaskerville", "baskerville", "baskervilleoldface"] },
  { id: "pt-serif", label: "PT Serif", category: "serif", match: ["ptserif"], metric: true },
  { id: "noto-serif", label: "Noto Serif", category: "serif", match: ["notoserif", "dejavuserif"] },
  { id: "crimson-text", label: "Crimson Text", category: "serif", match: ["crimsontext", "crimson", "minionpro", "minion"] },
  { id: "source-serif-4", label: "Source Serif 4", category: "serif", match: ["sourceserif4", "sourceserifpro", "sourceserif"], metric: true },
  { id: "libre-caslon-text", label: "Libre Caslon", category: "serif", match: ["librecaslontext", "librecaslon", "caslon", "adobecaslonpro"] },
  { id: "cormorant-garamond", label: "Cormorant Garamond", category: "serif", match: ["cormorantgaramond", "cormorant"], metric: true },
  { id: "bitter", label: "Bitter", category: "serif", match: ["bitter", "rockwell"] },
  { id: "ibm-plex-serif", label: "IBM Plex Serif", category: "serif", match: ["ibmplexserif", "plexserif"], metric: true },
  { id: "spectral", label: "Spectral", category: "serif", match: ["spectral", "palatino", "palatinolinotype", "bookantiqua"] },

  { id: "roboto-mono", label: "Roboto Mono", category: "mono", match: ["robotomono", "consolas", "menlo", "monaco", "sfmono"] },
  { id: "source-code-pro", label: "Source Code Pro", category: "mono", match: ["sourcecodepro"], metric: true },
  { id: "jetbrains-mono", label: "JetBrains Mono", category: "mono", match: ["jetbrainsmono", "dejavusansmono", "lucidaconsole"] },
  { id: "ibm-plex-mono", label: "IBM Plex Mono", category: "mono", match: ["ibmplexmono", "plexmono"], metric: true },
  { id: "fira-code", label: "Fira Code", category: "mono", match: ["firacode", "firamono"] },
  { id: "space-mono", label: "Space Mono", category: "mono", match: ["spacemono"], metric: true },

  { id: "bebas-neue", label: "Bebas Neue", category: "display", match: ["bebasneue", "bebas"], metric: true },
  { id: "anton", label: "Anton", category: "display", match: ["anton", "impact"] },
  { id: "abril-fatface", label: "Abril Fatface", category: "display", match: ["abrilfatface"], metric: true },
  { id: "archivo-black", label: "Archivo Black", category: "display", match: ["archivoblack", "arialblack"] },
  { id: "lobster", label: "Lobster", category: "display", match: ["lobster"], metric: true },
  { id: "righteous", label: "Righteous", category: "display", match: ["righteous"], metric: true },

  { id: "dancing-script", label: "Dancing Script", category: "script", match: ["dancingscript"], metric: true },
  { id: "pacifico", label: "Pacifico", category: "script", match: ["pacifico"], metric: true },
  { id: "caveat", label: "Caveat", category: "script", match: ["caveat"], metric: true },
  { id: "great-vibes", label: "Great Vibes", category: "script", match: ["greatvibes"], metric: true },
  { id: "satisfy", label: "Satisfy", category: "script", match: ["satisfy"], metric: true },
  { id: "kalam", label: "Kalam", category: "script", match: ["kalam"], metric: true },
  { id: "indie-flower", label: "Indie Flower", category: "script", match: ["indieflower", "comicsans", "comicsansms"] },
  { id: "shadows-into-light", label: "Shadows Into Light", category: "script", match: ["shadowsintolight"], metric: true },
];

export type Variant = "400-normal" | "700-normal" | "400-italic" | "700-italic";
const AVAILABLE = available as Record<string, { styles: Variant[]; ext: boolean }>;

export const isBuiltin = (id: string): id is "Helvetica" | "Times" | "Courier" => id === "Helvetica" || id === "Times" || id === "Courier";

export function catalogFont(id: string): CatalogFont | undefined {
  return CATALOG.find((f) => f.id === id);
}

/** Styles a library family ships (built-ins have all four). */
export function stylesOf(id: string): Variant[] {
  if (isBuiltin(id)) return ["400-normal", "700-normal", "400-italic", "700-italic"];
  return AVAILABLE[id]?.styles ?? [];
}

export const hasLatinExt = (id: string) => !!AVAILABLE[id]?.ext;

export const variantOf = (bold: boolean, italic: boolean): Variant => `${bold ? 700 : 400}-${italic ? "italic" : "normal"}`;
