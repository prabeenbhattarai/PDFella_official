import {
  MousePointer2, Hand, TextCursor, Type, Eraser, Highlighter, Underline, Strikethrough, PenLine, Brush, Square, Circle,
  Minus, MoveUpRight, Pentagon, Cloud, ImagePlus, Signature, Stamp, Check, X, Star, StickyNote, Link2, SquareSlash,
  TextCursorInput, type LucideIcon, SquareDashed,
} from "lucide-react";
import type { ToolId } from "@/lib/editor/store";

export interface ToolDef {
  id: ToolId;
  label: string;
  /** Short label shown under the icon in the tool rail. */
  short: string;
  icon: LucideIcon;
  key?: string;
  hint: string;
  /** Tool stays active after creating an object (otherwise it returns to Select). */
  sticky?: boolean;
  /** How the tool creates objects. */
  gesture: "none" | "click" | "box" | "line" | "ink" | "erase";
}

export const TOOL_DEFS: Record<ToolId, ToolDef> = {
  select: { id: "select", short: "Select", label: "Select", icon: MousePointer2, key: "v", hint: "Select, move and resize objects. Double-click any text in the PDF to edit it.", gesture: "none" },
  hand: { id: "hand", short: "Pan", label: "Hand", icon: Hand, key: "h", hint: "Drag to move around the page", gesture: "none" },
  editText: { id: "editText", short: "Edit text", label: "Edit text", icon: TextCursor, key: "e", hint: "Click any existing word or sentence in the PDF to change it", gesture: "click" },
  text: { id: "text", short: "Add text", label: "Add text", icon: Type, key: "t", hint: "Click to add a text box, or drag to set its width", gesture: "box" },
  whiteout: { id: "whiteout", short: "Whiteout", label: "Whiteout", icon: Eraser, key: "w", hint: "Drag over text or an area to white it out", gesture: "box", sticky: true },
  highlight: { id: "highlight", short: "Highlight", label: "Highlight", icon: Highlighter, key: "m", hint: "Drag across text to highlight it", gesture: "box", sticky: true },
  underline: { id: "underline", short: "Underline", label: "Underline", icon: Underline, key: "u", hint: "Drag across text to underline it", gesture: "box", sticky: true },
  strike: { id: "strike", short: "Strike", label: "Strikethrough", icon: Strikethrough, hint: "Drag across text to strike it through", gesture: "box", sticky: true },
  ink: { id: "ink", short: "Draw", label: "Pen", icon: Brush, key: "p", hint: "Draw freehand", gesture: "ink", sticky: true },
  eraser: { id: "eraser", short: "Eraser", label: "Eraser", icon: PenLine, key: "x", hint: "Drag over drawings and shapes to erase them", gesture: "erase", sticky: true },
  line: { id: "line", short: "Line", label: "Line", icon: Minus, key: "l", hint: "Drag to draw a line (Shift snaps to 45°)", gesture: "line" },
  arrow: { id: "arrow", short: "Arrow", label: "Arrow", icon: MoveUpRight, key: "a", hint: "Drag to draw an arrow (Shift snaps to 45°)", gesture: "line" },
  rect: { id: "rect", short: "Rectangle", label: "Rectangle", icon: Square, key: "r", hint: "Drag to draw a rectangle (Shift for square)", gesture: "box" },
  ellipse: { id: "ellipse", short: "Ellipse", label: "Ellipse", icon: Circle, key: "o", hint: "Drag to draw an ellipse (Shift for circle)", gesture: "box" },
  polygon: { id: "polygon", short: "Polygon", label: "Polygon", icon: Pentagon, hint: "Drag to draw a polygon", gesture: "box" },
  cloud: { id: "cloud", short: "Cloud", label: "Cloud", icon: Cloud, hint: "Drag to draw a cloud callout", gesture: "box" },
  image: { id: "image", short: "Image", label: "Image", icon: ImagePlus, key: "i", hint: "Choose an image, then click to place it", gesture: "none" },
  signature: { id: "signature", short: "Sign", label: "Signature", icon: Signature, key: "s", hint: "Create a signature, then click to place it", gesture: "none" },
  stamp: { id: "stamp", short: "Stamp", label: "Stamp", icon: Stamp, hint: "Click to place a stamp", gesture: "click" },
  check: { id: "check", short: "Check", label: "Checkmark", icon: Check, hint: "Click to place a checkmark", gesture: "click", sticky: true },
  cross: { id: "cross", short: "Cross", label: "Cross", icon: X, hint: "Click to place a cross", gesture: "click", sticky: true },
  star: { id: "star", short: "Star", label: "Star", icon: Star, hint: "Click to place a star", gesture: "click", sticky: true },
  note: { id: "note", short: "Comment", label: "Comment", icon: StickyNote, key: "n", hint: "Click to add a sticky-note comment", gesture: "click" },
  link: { id: "link", short: "Link", label: "Link", icon: Link2, key: "k", hint: "Drag over an area to make it a hyperlink", gesture: "box" },
  field: { id: "field", short: "Form field", label: "Form field", icon: TextCursorInput, key: "f", hint: "Drag to add a fillable form field", gesture: "box" },
  redact: { id: "redact", short: "Redact", label: "Redact", icon: SquareSlash, key: "d", hint: "Drag across text or an area to mark it for redaction", gesture: "box", sticky: true },
};

export interface RailGroup { name: string; tools: ToolId[] }

/** Tool rail layout. Groups open a menu and show their name under the icon. */
export const RAIL: (ToolId | RailGroup | "|")[] = [
  "select", "hand", "|",
  "editText", "text", "whiteout", "|",
  { name: "Markup", tools: ["highlight", "underline", "strike"] },
  { name: "Draw", tools: ["ink", "eraser"] },
  { name: "Shapes", tools: ["rect", "ellipse", "line", "arrow", "polygon", "cloud"] }, "|",
  "image", "signature", { name: "Stamps", tools: ["stamp", "check", "cross", "star"] }, "|",
  "note", "link", "field", "|",
  "redact",
];

export const SquareDashedIcon = SquareDashed;

export const STAMPS = ["APPROVED", "REVIEWED", "DRAFT", "CONFIDENTIAL", "FINAL", "REJECTED", "PAID", "RECEIVED", "VOID", "COPY"];
export const STAMP_COLORS: Record<string, string> = {
  APPROVED: "#2e9e5b", REVIEWED: "#1f6feb", DRAFT: "#5b6170", CONFIDENTIAL: "#d0312d", FINAL: "#2e9e5b",
  REJECTED: "#d0312d", PAID: "#2e9e5b", RECEIVED: "#1f6feb", VOID: "#d0312d", COPY: "#6e40c9",
};
