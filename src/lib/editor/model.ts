/**
 * Editor document model.
 *
 * Layers (see docs/ARCHITECTURE.md §4):
 *   1. sources      — original PDF bytes, immutable, never modified in place
 *   2. pages        — ordered page references (organise ops only touch this)
 *   3. objects      — per-page overlay objects in *display space*:
 *                     PDF points, origin top-left of the page as displayed
 *                     (i.e. after the page's rotation is applied)
 *
 * Object kinds are grouped by how they are exported:
 *   content edits  → textEdit                (replace original text)
 *   overlays       → text, whiteout, shapes, ink, image, signature, stamp, markup
 *   annotations    → note, link              (real PDF annotations)
 *   form fields    → field                   (real AcroForm widgets)
 *   redactions     → redact                  (destructive, applied last)
 */

/**
 * Font id: "Helvetica" | "Times" | "Courier" (standard PDF fonts), a library font id
 * from src/lib/fonts/catalog.ts, or "orig:<asset>:<bold><italic>" for a font
 * embedded in the user's PDF. See src/lib/fonts/loader.ts.
 */
export type FontFamily = string;

export interface Box { x: number; y: number; w: number; h: number }

interface Base extends Box {
  id: string;
  /** Clockwise rotation in degrees, about the box centre. */
  rotation: number;
  opacity: number;
  locked?: boolean;
}

export interface TextStyle {
  font: FontFamily;
  /** Used for characters the main font lacks (an original PDF font only holds the glyphs it used). */
  fontFallback?: FontFamily;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
  background: string | null;
}

export interface TextObject extends Base, TextStyle { kind: "text"; text: string }

/** The look of the original PDF text, as detected when an edit starts. */
export type OriginalStyle = Pick<TextStyle, "font" | "fontFallback" | "size" | "color" | "bold" | "italic" | "letterSpacing">;
export const ORIGINAL_STYLE_KEYS = ["font", "fontFallback", "size", "color", "bold", "italic", "letterSpacing"] as const;

/** Replacement for a run of original page text. */
export interface TextEditObject extends Base, TextStyle {
  kind: "textEdit";
  text: string;
  original: {
    text: string;
    box: Box;
    fontName: string;
    /** Run origin/direction in the source page's user space, used to delete the original glyphs. */
    pdf?: { x: number; y: number; dx: number; dy: number; width: number; size: number };
    /** All runs that make up the edited line (a sentence is often stored as several runs). */
    pdfRuns?: { x: number; y: number; dx: number; dy: number; width: number; size: number }[];
  };
  /** Colour used to cover the original glyphs in the overlay strategy. */
  cover: string;
  /** Detected style of the original text ("Match original style" restores it). */
  originalStyle?: OriginalStyle;
  /**
   * How the original font is reproduced:
   * embedded — the font file inside the PDF is reused
   * metric   — a library font with the same design/widths
   * similar  — the closest available design (looks different)
   */
  fontMatch?: { name: string; kind: "embedded" | "metric" | "similar"; fallbackMetric?: boolean };
  /** "keep": the user chose to keep a look that differs from the original (don't ask again). */
  styleAck?: "keep";
  /**
   * remove  — original glyphs deleted from the page content stream (tried first, in the browser)
   * overlay — original covered, replacement typeset on top (fallback when removal isn't safe)
   */
  strategy: "remove" | "overlay";
}

export interface WhiteoutObject extends Base { kind: "whiteout"; color: string }
export interface MarkupObject extends Base { kind: "highlight" | "underline" | "strike"; color: string }
export interface RedactObject extends Base { kind: "redact"; fill: string; label?: string }

export interface ShapeObject extends Base {
  kind: "rect" | "ellipse" | "cloud" | "polygon";
  stroke: string | null;
  fill: string | null;
  strokeWidth: number;
  /** Polygon vertices, normalised 0..1 within the box. */
  points?: [number, number][];
}

export interface LineObject extends Base {
  kind: "line" | "arrow";
  /** Endpoints in page space (box is derived from them). */
  x1: number; y1: number; x2: number; y2: number;
  stroke: string;
  strokeWidth: number;
}

export interface InkObject extends Base {
  kind: "ink";
  /** Strokes, each a list of points normalised 0..1 within the box. */
  strokes: [number, number][][];
  stroke: string;
  strokeWidth: number;
}

export interface ImageObject extends Base {
  kind: "image" | "signature";
  /** Key into the asset store (data URL kept outside history snapshots). */
  asset: string;
  /** Crop in normalised source-image coordinates. */
  crop: Box;
}

export interface SymbolObject extends Base { kind: "check" | "cross" | "star" | "dot"; color: string }

export interface StampObject extends Base { kind: "stamp"; label: string; color: string }

export interface NoteObject extends Base { kind: "note"; text: string; color: string; author: string }

export interface LinkObject extends Base { kind: "link"; url: string }

export type FieldType = "text" | "checkbox" | "radio" | "dropdown" | "date" | "signature";
export interface FieldObject extends Base {
  kind: "field";
  fieldType: FieldType;
  name: string;
  options: string[];
  required: boolean;
  /** Radio group name. */
  group?: string;
}

export type EditorObject =
  | TextObject | TextEditObject | WhiteoutObject | MarkupObject | RedactObject
  | ShapeObject | LineObject | InkObject | ImageObject | SymbolObject | StampObject
  | NoteObject | LinkObject | FieldObject;

export type ObjectKind = EditorObject["kind"];

export interface PageRef {
  id: string;
  /** null for inserted blank pages. */
  sourceId: string | null;
  sourceIndex: number;
  /** Extra user rotation (0/90/180/270) added to the page's intrinsic rotation. */
  rotation: number;
  /** Intrinsic /Rotate of the source page. */
  baseRotation: number;
  /** Unrotated page size in points. */
  width: number;
  height: number;
}

export interface SourceDoc {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  /** True if the document appears to be image-only (OCR candidate). */
  scanned?: boolean;
  hasForm?: boolean;
}

export interface Snapshot {
  pages: PageRef[];
  objects: Record<string, EditorObject[]>;
}

export const totalRotation = (p: PageRef) => (((p.baseRotation + p.rotation) % 360) + 360) % 360;

/** Display size of a page (after rotation) in points. */
export function displaySize(p: PageRef): { w: number; h: number } {
  const r = totalRotation(p);
  return r === 90 || r === 270 ? { w: p.height, h: p.width } : { w: p.width, h: p.height };
}

export const defaultTextStyle: TextStyle = {
  font: "Helvetica",
  size: 14,
  color: "#15171c",
  bold: false,
  italic: false,
  underline: false,
  align: "left",
  lineHeight: 1.25,
  letterSpacing: 0,
  background: null,
};

export const isTextLike = (o: EditorObject): o is TextObject | TextEditObject => o.kind === "text" || o.kind === "textEdit";
