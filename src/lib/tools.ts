/**
 * Tool registry — the single source of truth for the tools grid, SEO pages,
 * sitemap, related-tool links and routing. Adding a tool = adding an entry here
 * (+ a workspace implementation if it is not editor-based).
 */
import type { DetectedKind } from "./security/filetype";

export type ToolCategory = "edit" | "organise" | "convert" | "optimise" | "security" | "forms";

export type Workspace =
  | { type: "editor"; tool?: string; panel?: "forms" | "pages" }
  | { type: "merge" }
  | { type: "split" }
  | { type: "pages"; op: "rotate" | "delete" | "extract" | "organise" }
  | { type: "compress" }
  | { type: "watermark" }
  | { type: "page-numbers" }
  | { type: "header-footer" }
  | { type: "images-to-pdf" }
  | { type: "pdf-to-images"; format: "jpg" | "png" }
  | { type: "pdf-to-text" }
  | { type: "flatten" }
  | { type: "pdf-to-docx" }
  | { type: "unlock" }
  | { type: "protect" }
  | { type: "repair" }
  | { type: "server"; op: ServerOp; output: string };

export type ServerOp =
  | "ocr" | "pdf-to-docx" | "pdf-to-xlsx" | "pdf-to-pptx" | "pdf-to-html"
  | "office-to-pdf" | "protect" | "unlock" | "repair" | "compress" | "redact" | "edit-text";

export interface Tool {
  slug: string;
  name: string;
  /** Short card description. */
  blurb: string;
  /** SEO page H1 + meta description. */
  title: string;
  description: string;
  category: ToolCategory;
  icon: string;
  accepts: DetectedKind[];
  multiple?: boolean;
  workspace: Workspace;
  /** Where the work actually happens — shown to users for transparency. */
  engine: "browser" | "server";
  features: string[];
  faq: { q: string; a: string }[];
  related: string[];
  /** Honest limitation note shown on the page when relevant. */
  limitation?: string;
}

export const categories: Record<ToolCategory, { name: string; description: string }> = {
  edit: { name: "Edit PDF", description: "Change text, mark up, draw and sign." },
  organise: { name: "Organise PDF", description: "Merge, split, reorder and tidy pages." },
  convert: { name: "Convert", description: "Move between PDF, Office and images." },
  optimise: { name: "Optimise", description: "Smaller, searchable, repaired files." },
  security: { name: "Security", description: "Protect, unlock, redact and watermark." },
  forms: { name: "Forms", description: "Fill in and build interactive forms." },
};

const PDF: DetectedKind[] = ["pdf"];
const IMAGES: DetectedKind[] = ["png", "jpg", "webp"];
const OFFICE: DetectedKind[] = ["docx", "xlsx", "pptx", "odt", "txt"];

const commonEditFaq = [
  { q: "Do I need an account?", a: "No. Open a file and start working. Nothing is required to sign up for." },
  { q: "Are my files uploaded?", a: "Editing happens entirely in your browser. Your PDF is not sent to our servers for this tool." },
];
const serverFaq = [
  { q: "Where is my file processed?", a: "This tool needs server-side processing. Your file is uploaded over HTTPS to a private, temporary storage location, processed in an isolated container, and deleted automatically within one hour." },
  { q: "Do you use my documents for training?", a: "No. Documents are never used for training, analytics or any purpose other than producing your result." },
];

export const tools: Tool[] = [
  // ───────── Edit
  {
    slug: "edit-pdf", name: "Edit PDF", blurb: "Change text, add images, shapes and more.",
    title: "Edit PDF online", description: "Edit PDF text, add new text, images, shapes and signatures directly in your browser. Free, fast and no account required.",
    category: "edit", icon: "PenLine", accepts: PDF, workspace: { type: "editor" }, engine: "browser",
    features: ["Edit existing text in place", "Add text with full formatting", "Whiteout, highlight and draw", "Insert images and signatures", "Reorder, rotate and delete pages", "Undo, redo and auto-save"],
    faq: [...commonEditFaq, { q: "Can I edit the original text of a PDF?", a: "Yes. Choose Edit text and click any line. When the embedded font allows it the original text is replaced; otherwise it is covered and re-typeset at the same position, size and style." }],
    related: ["sign-pdf", "annotate-pdf", "whiteout-pdf", "add-text-to-pdf"],
  },
  {
    slug: "add-text-to-pdf", name: "Add Text", blurb: "Type anywhere on a page.",
    title: "Add text to PDF", description: "Add text boxes to any PDF with your choice of font, size, colour, alignment and background.",
    category: "edit", icon: "Type", accepts: PDF, workspace: { type: "editor", tool: "text" }, engine: "browser",
    features: ["Font, size, colour and alignment", "Bold, italic and underline", "Background colour and opacity", "Rotate and resize text boxes"],
    faq: commonEditFaq, related: ["edit-pdf", "fill-pdf", "sign-pdf"],
  },
  {
    slug: "whiteout-pdf", name: "Whiteout", blurb: "Cover content with clean white boxes.",
    title: "Whiteout PDF", description: "Hide parts of a PDF with whiteout boxes, then type over them. Change the cover colour to match the page.",
    category: "edit", icon: "Eraser", accepts: PDF, workspace: { type: "editor", tool: "whiteout" }, engine: "browser",
    features: ["Drag to cover any area", "Snap to text lines", "Any cover colour", "Move, resize, delete"],
    faq: [...commonEditFaq, { q: "Does whiteout remove the text underneath?", a: "No. Whiteout is visual. If the hidden content is sensitive use Redact, which permanently deletes it from the file." }],
    related: ["redact-pdf", "edit-pdf"],
  },
  {
    slug: "highlight-pdf", name: "Highlight", blurb: "Highlight, underline and strike text.",
    title: "Highlight PDF", description: "Highlight, underline or strike through text in any PDF. Markup snaps to the lines of text you select.",
    category: "edit", icon: "Highlighter", accepts: PDF, workspace: { type: "editor", tool: "highlight" }, engine: "browser",
    features: ["Snaps to text lines", "Any colour", "Underline and strikethrough", "Adjustable opacity"],
    faq: commonEditFaq, related: ["annotate-pdf", "edit-pdf"],
  },
  {
    slug: "draw-on-pdf", name: "Draw", blurb: "Freehand pen, lines and arrows.",
    title: "Draw on PDF", description: "Draw freehand, add lines, arrows and shapes to a PDF with a mouse, trackpad, pen or finger.",
    category: "edit", icon: "Brush", accepts: PDF, workspace: { type: "editor", tool: "ink" }, engine: "browser",
    features: ["Smooth freehand pen", "Lines and arrows", "Stroke width, colour and opacity", "Object eraser"],
    faq: commonEditFaq, related: ["annotate-pdf", "add-shapes-to-pdf"],
  },
  {
    slug: "annotate-pdf", name: "Annotate", blurb: "Comments, sticky notes and stamps.",
    title: "Annotate PDF", description: "Add sticky-note comments, stamps, checkmarks and markup to a PDF. Notes are saved as real PDF annotations.",
    category: "edit", icon: "MessageSquareText", accepts: PDF, workspace: { type: "editor", tool: "note" }, engine: "browser",
    features: ["Sticky notes as real PDF comments", "Approved / Draft / Confidential stamps", "Checkmarks, crosses and stars", "Hyperlinks"],
    faq: commonEditFaq, related: ["highlight-pdf", "draw-on-pdf"],
  },
  {
    slug: "add-image-to-pdf", name: "Add Images", blurb: "Place, crop and rotate images.",
    title: "Add image to PDF", description: "Insert PNG, JPG or WEBP images into a PDF. Move, resize, crop, rotate and adjust opacity.",
    category: "edit", icon: "ImagePlus", accepts: PDF, workspace: { type: "editor", tool: "image" }, engine: "browser",
    features: ["PNG, JPG and WEBP", "Crop, rotate and resize", "Opacity control", "Drag and drop onto the page"],
    faq: commonEditFaq, related: ["edit-pdf", "jpg-to-pdf"],
  },
  {
    slug: "add-shapes-to-pdf", name: "Add Shapes", blurb: "Rectangles, circles, arrows, clouds.",
    title: "Add shapes to PDF", description: "Draw rectangles, ellipses, lines, arrows, polygons and cloud callouts on a PDF.",
    category: "edit", icon: "Shapes", accepts: PDF, workspace: { type: "editor", tool: "rect" }, engine: "browser",
    features: ["Rectangle, ellipse, polygon, cloud", "Fill and stroke colours", "Stroke width and opacity", "Rotate any shape"],
    faq: commonEditFaq, related: ["draw-on-pdf", "annotate-pdf"],
  },
  {
    slug: "sign-pdf", name: "Sign PDF", blurb: "Type, draw or upload a signature.",
    title: "Sign PDF online", description: "Sign a PDF by typing, drawing or uploading your signature. Place, resize and rotate it anywhere.",
    category: "edit", icon: "Signature", accepts: PDF, workspace: { type: "editor", tool: "signature" }, engine: "browser",
    features: ["Typed signatures in handwriting fonts", "Draw with mouse, pen or finger", "Upload a signature image", "Reuse during your session"],
    faq: [...commonEditFaq, { q: "Is my signature stored?", a: "Only in this browser tab's memory unless you choose to remember it on this device. It is never sent to our servers." }],
    related: ["fill-pdf", "edit-pdf"],
  },

  // ───────── Organise
  {
    slug: "merge-pdf", name: "Merge PDF", blurb: "Combine files into one PDF.",
    title: "Merge PDF files", description: "Combine multiple PDFs into a single document. Reorder files and preview before merging.",
    category: "organise", icon: "Combine", accepts: PDF, multiple: true, workspace: { type: "merge" }, engine: "browser",
    features: ["Drag to reorder files", "Preview first pages", "Add or remove files", "Runs in your browser"],
    faq: commonEditFaq, related: ["split-pdf", "rearrange-pdf-pages", "compress-pdf"],
  },
  {
    slug: "split-pdf", name: "Split PDF", blurb: "Divide a PDF into separate files.",
    title: "Split PDF", description: "Split a PDF by page ranges, into single pages, or into odd and even pages.",
    category: "organise", icon: "Split", accepts: PDF, workspace: { type: "split" }, engine: "browser",
    features: ["Custom page ranges", "Every page as its own file", "Odd / even pages", "Fixed-size chunks"],
    faq: commonEditFaq, related: ["extract-pdf-pages", "merge-pdf"],
  },
  {
    slug: "rotate-pdf", name: "Rotate PDF", blurb: "Turn pages the right way up.",
    title: "Rotate PDF pages", description: "Rotate all pages or individual pages of a PDF and save the result permanently.",
    category: "organise", icon: "RotateCw", accepts: PDF, workspace: { type: "pages", op: "rotate" }, engine: "browser",
    features: ["Rotate individual pages", "Rotate all at once", "Live thumbnails"],
    faq: commonEditFaq, related: ["rearrange-pdf-pages", "delete-pdf-pages"],
  },
  {
    slug: "rearrange-pdf-pages", name: "Rearrange Pages", blurb: "Drag pages into a new order.",
    title: "Reorder PDF pages", description: "Rearrange, duplicate, rotate, delete and insert pages with drag-and-drop thumbnails.",
    category: "organise", icon: "LayoutGrid", accepts: PDF, workspace: { type: "pages", op: "organise" }, engine: "browser",
    features: ["Drag-and-drop ordering", "Duplicate and delete", "Insert blank pages", "Keyboard accessible"],
    faq: commonEditFaq, related: ["merge-pdf", "rotate-pdf"],
  },
  {
    slug: "delete-pdf-pages", name: "Delete Pages", blurb: "Remove pages you don't need.",
    title: "Delete PDF pages", description: "Select and remove pages from a PDF in seconds.",
    category: "organise", icon: "FileMinus", accepts: PDF, workspace: { type: "pages", op: "delete" }, engine: "browser",
    features: ["Click to select pages", "Select by range", "Preview the result"],
    faq: commonEditFaq, related: ["extract-pdf-pages", "rearrange-pdf-pages"],
  },
  {
    slug: "extract-pdf-pages", name: "Extract Pages", blurb: "Pull selected pages into a new PDF.",
    title: "Extract PDF pages", description: "Choose pages and save them as a new PDF, leaving the original untouched.",
    category: "organise", icon: "FileOutput", accepts: PDF, workspace: { type: "pages", op: "extract" }, engine: "browser",
    features: ["Click or range selection", "Keeps original quality", "Instant download"],
    faq: commonEditFaq, related: ["split-pdf", "delete-pdf-pages"],
  },

  // ───────── Convert
  {
    slug: "pdf-to-word", name: "PDF to Word", blurb: "Editable DOCX from a PDF.",
    title: "Convert PDF to Word", description: "Turn a PDF into an editable Word document that keeps paragraphs, tables and images as closely as possible.",
    category: "convert", icon: "FileText", accepts: PDF, workspace: { type: "pdf-to-docx" }, engine: "browser",
    features: ["Editable paragraphs and headings", "Keeps bold, italic and font sizes", "Keeps images and page sizes", "Converts in seconds in your browser", "Live progress for every page"],
    faq: [...commonEditFaq,
      { q: "How fast is it?", a: "Most documents convert in a few seconds because nothing is uploaded. The conversion runs on your device, page by page." },
      { q: "What about scanned PDFs?", a: "Scanned pages are images of text. Run OCR PDF first to make the text recognisable, then convert." }],
    related: ["word-to-pdf", "ocr-pdf"],
    limitation: "PDF is a fixed-layout format: tables come across as text lines, and multi-column layouts flow in reading order. Expect light tidying in Word for complex designs.",
  },
  {
    slug: "pdf-to-jpg", name: "PDF to JPG", blurb: "Every page as a JPG image.",
    title: "Convert PDF to JPG", description: "Convert each page of a PDF into a high-quality JPG image, downloaded as a ZIP.",
    category: "convert", icon: "FileImage", accepts: PDF, workspace: { type: "pdf-to-images", format: "jpg" }, engine: "browser",
    features: ["Choose resolution", "All pages or a range", "Runs in your browser"],
    faq: commonEditFaq, related: ["pdf-to-png", "jpg-to-pdf"],
  },
  {
    slug: "pdf-to-png", name: "PDF to PNG", blurb: "Lossless page images.",
    title: "Convert PDF to PNG", description: "Convert PDF pages into lossless PNG images, downloaded as a ZIP.",
    category: "convert", icon: "FileImage", accepts: PDF, workspace: { type: "pdf-to-images", format: "png" }, engine: "browser",
    features: ["Lossless output", "Choose resolution", "Runs in your browser"],
    faq: commonEditFaq, related: ["pdf-to-jpg", "png-to-pdf"],
  },
  {
    slug: "pdf-to-excel", name: "PDF to Excel", blurb: "Extract tables to XLSX.",
    title: "Convert PDF to Excel", description: "Extract tables from a PDF into an Excel spreadsheet, one sheet per page.",
    category: "convert", icon: "Sheet", accepts: PDF, workspace: { type: "server", op: "pdf-to-xlsx", output: "xlsx" }, engine: "server",
    features: ["Table detection", "One sheet per page", "Numbers stay numbers"],
    faq: serverFaq, related: ["pdf-to-word", "ocr-pdf"],
    limitation: "Works best with PDFs that contain real (ruled or well-aligned) tables. Scanned tables need OCR first.",
  },
  {
    slug: "pdf-to-powerpoint", name: "PDF to PowerPoint", blurb: "Slides from PDF pages.",
    title: "Convert PDF to PowerPoint", description: "Turn each page of a PDF into a PowerPoint slide.",
    category: "convert", icon: "Presentation", accepts: PDF, workspace: { type: "server", op: "pdf-to-pptx", output: "pptx" }, engine: "server",
    features: ["One slide per page", "Keeps page appearance", "Speaker notes contain page text"],
    faq: serverFaq, related: ["pdf-to-word", "pdf-to-jpg"],
    limitation: "Slides contain a faithful image of each page with the extracted text in the notes; text is not re-flowed into editable text boxes.",
  },
  {
    slug: "pdf-to-text", name: "PDF to Text", blurb: "Plain text from every page.",
    title: "Convert PDF to text", description: "Extract the text of a PDF into a plain .txt file.",
    category: "convert", icon: "FileType", accepts: PDF, workspace: { type: "pdf-to-text" }, engine: "browser",
    features: ["Keeps reading order", "Page separators", "Runs in your browser"],
    faq: [...commonEditFaq, { q: "Why is my text empty?", a: "Scanned PDFs are images of text. Run OCR first to make them searchable, then extract." }],
    related: ["ocr-pdf", "pdf-to-word"],
  },
  {
    slug: "word-to-pdf", name: "Word to PDF", blurb: "DOCX, XLSX, PPTX to PDF.",
    title: "Convert Word to PDF", description: "Convert Word, Excel, PowerPoint, OpenDocument and text files to PDF.",
    category: "convert", icon: "FileInput", accepts: OFFICE, workspace: { type: "server", op: "office-to-pdf", output: "pdf" }, engine: "server",
    features: ["DOCX, XLSX, PPTX, ODT, TXT", "Keeps layout and fonts", "Accurate page breaks"],
    faq: serverFaq, related: ["pdf-to-word", "merge-pdf"],
  },
  {
    slug: "excel-to-pdf", name: "Excel to PDF", blurb: "Spreadsheets to PDF.",
    title: "Convert Excel to PDF", description: "Convert Excel spreadsheets (XLSX) to PDF with columns, formatting and sheets intact.",
    category: "convert", icon: "Sheet", accepts: ["xlsx", "odt"], workspace: { type: "server", op: "office-to-pdf", output: "pdf" }, engine: "server",
    features: ["XLSX and ODS spreadsheets", "Keeps formatting and fonts", "Every sheet included"],
    faq: serverFaq, related: ["pdf-to-excel", "word-to-pdf", "powerpoint-to-pdf"],
  },
  {
    slug: "powerpoint-to-pdf", name: "PowerPoint to PDF", blurb: "Slides to PDF.",
    title: "Convert PowerPoint to PDF", description: "Convert PowerPoint presentations (PPTX) to PDF, one slide per page.",
    category: "convert", icon: "Presentation", accepts: ["pptx", "odt"], workspace: { type: "server", op: "office-to-pdf", output: "pdf" }, engine: "server",
    features: ["PPTX and ODP presentations", "One slide per page", "Keeps images and fonts"],
    faq: serverFaq, related: ["pdf-to-powerpoint", "word-to-pdf", "excel-to-pdf"],
  },
  {
    slug: "jpg-to-pdf", name: "JPG to PDF", blurb: "Images into a PDF.",
    title: "Convert JPG to PDF", description: "Combine JPG, PNG and WEBP images into a single PDF with your choice of page size and margins.",
    category: "convert", icon: "Images", accepts: IMAGES, multiple: true, workspace: { type: "images-to-pdf" }, engine: "browser",
    features: ["Reorder images", "Fit, A4 or Letter pages", "Margins and orientation"],
    faq: commonEditFaq, related: ["png-to-pdf", "pdf-to-jpg"],
  },
  {
    slug: "png-to-pdf", name: "PNG to PDF", blurb: "PNG images into a PDF.",
    title: "Convert PNG to PDF", description: "Turn PNG images into a PDF document, keeping transparency on a white page.",
    category: "convert", icon: "Images", accepts: IMAGES, multiple: true, workspace: { type: "images-to-pdf" }, engine: "browser",
    features: ["Lossless embedding", "Reorder images", "Page size options"],
    faq: commonEditFaq, related: ["jpg-to-pdf", "pdf-to-png"],
  },

  // ───────── Optimise
  {
    slug: "compress-pdf", name: "Compress PDF", blurb: "Shrink file size, keep quality.",
    title: "Compress PDF", description: "Reduce the size of a PDF while keeping it readable. Choose between recommended, high compression and high quality.",
    category: "optimise", icon: "Minimize2", accepts: PDF, workspace: { type: "compress" }, engine: "browser",
    features: ["Three quality presets", "Before / after size", "Image downsampling on the server", "Structure optimisation in the browser"],
    faq: [...commonEditFaq, { q: "How much smaller will my file be?", a: "It depends on content. Image-heavy scans often shrink 50–90%. Text-only PDFs are usually already compact." }],
    related: ["merge-pdf", "pdf-to-jpg"],
  },
  {
    slug: "ocr-pdf", name: "OCR PDF", blurb: "Make scans searchable.",
    title: "OCR PDF: make scanned PDFs searchable", description: "Recognise text in scanned PDFs and add an invisible, searchable, selectable text layer.",
    category: "optimise", icon: "ScanText", accepts: PDF, workspace: { type: "server", op: "ocr", output: "pdf" }, engine: "server",
    features: ["100+ languages", "Searchable, copyable text", "Deskew and rotate pages", "Keeps original appearance"],
    faq: serverFaq, related: ["pdf-to-word", "pdf-to-text"],
  },
  {
    slug: "repair-pdf", name: "Repair PDF", blurb: "Recover damaged files.",
    title: "Repair PDF", description: "Rebuild the structure of a damaged or corrupted PDF so it opens again.",
    category: "optimise", icon: "Wrench", accepts: PDF, workspace: { type: "repair" }, engine: "browser",
    features: ["Rebuilds cross-reference tables", "Recovers readable pages", "Normalises structure", "Runs in your browser"],
    faq: commonEditFaq, related: ["compress-pdf", "flatten-pdf"],
    limitation: "Severely truncated files may only be partly recoverable.",
  },
  {
    slug: "flatten-pdf", name: "Flatten PDF", blurb: "Bake in forms and annotations.",
    title: "Flatten PDF", description: "Flatten form fields and annotations into the page content so they can't be changed.",
    category: "optimise", icon: "Layers", accepts: PDF, workspace: { type: "flatten" }, engine: "browser",
    features: ["Flatten form fields", "Keeps appearance", "Runs in your browser"],
    faq: commonEditFaq, related: ["fill-pdf", "protect-pdf"],
  },

  // ───────── Security
  {
    slug: "protect-pdf", name: "Protect PDF", blurb: "Add a password.",
    title: "Password protect PDF", description: "Encrypt a PDF with AES-256 so it needs a password to open.",
    category: "security", icon: "Lock", accepts: PDF, workspace: { type: "protect" }, engine: "browser",
    features: ["AES-256 encryption", "Restrict printing, copying and editing", "Your password never leaves your device"],
    faq: commonEditFaq, related: ["unlock-pdf", "watermark-pdf"],
  },
  {
    slug: "unlock-pdf", name: "Unlock PDF", blurb: "Remove passwords and restrictions.",
    title: "Unlock PDF", description: "Remove the password and printing, copying or editing restrictions from a PDF.",
    category: "security", icon: "LockOpen", accepts: PDF, workspace: { type: "unlock" }, engine: "browser",
    features: ["Removes copy, print and edit restrictions automatically", "Removes the open password when you enter it", "Keeps content intact", "Runs in your browser"],
    faq: [...commonEditFaq,
      { q: "Do I need the password?", a: "Only if the PDF asks for a password to open. PDFs that just restrict printing, copying or editing are unlocked automatically." },
      { q: "Do other tools work with protected PDFs?", a: "Yes. Every tool, including the editor, unlocks protected PDFs automatically when you open them (asking for the password once if the file needs one)." }],
    related: ["protect-pdf"],
  },
  {
    slug: "redact-pdf", name: "Redact PDF", blurb: "Permanently remove sensitive data.",
    title: "Redact PDF", description: "Mark text or areas for redaction and permanently remove them from the PDF, not just cover them.",
    category: "security", icon: "SquareSlash", accepts: PDF, workspace: { type: "editor", tool: "redact" }, engine: "browser",
    features: ["Select text or areas", "Preview before applying", "Underlying content is deleted", "Search to find every occurrence"],
    faq: [...commonEditFaq, { q: "Is the redacted text really gone?", a: "Yes. With the processing service, redacted text is removed from the page content. Without it, affected pages are rebuilt as images in your browser, so the text no longer exists in the file." }],
    related: ["whiteout-pdf", "protect-pdf"],
  },
  {
    slug: "watermark-pdf", name: "Watermark", blurb: "Stamp text or a logo on pages.",
    title: "Add watermark to PDF", description: "Add a text or image watermark to a PDF with control over opacity, rotation, position and pages.",
    category: "security", icon: "Droplets", accepts: PDF, workspace: { type: "watermark" }, engine: "browser",
    features: ["Text or image", "Opacity and rotation", "Nine positions or tiled", "All or selected pages"],
    faq: commonEditFaq, related: ["add-page-numbers-to-pdf", "protect-pdf"],
  },
  {
    slug: "add-page-numbers-to-pdf", name: "Page Numbers", blurb: "Number your pages.",
    title: "Add page numbers to PDF", description: "Add page numbers in any corner with formats like “1” or “Page 1 of 10”.",
    category: "organise", icon: "ListOrdered", accepts: PDF, workspace: { type: "page-numbers" }, engine: "browser",
    features: ["Six positions", "Custom format and start number", "Font size and margin", "Page range"],
    faq: commonEditFaq, related: ["add-header-and-footer-to-pdf", "watermark-pdf"],
  },
  {
    slug: "add-header-and-footer-to-pdf", name: "Header & Footer", blurb: "Text, dates and page numbers.",
    title: "Add header and footer to PDF", description: "Add header and footer text with page numbers, dates and the document name.",
    category: "organise", icon: "PanelTop", accepts: PDF, workspace: { type: "header-footer" }, engine: "browser",
    features: ["{page}, {pages}, {date}, {name} tokens", "Left, centre or right", "All or selected pages"],
    faq: commonEditFaq, related: ["add-page-numbers-to-pdf", "watermark-pdf"],
  },

  // ───────── Forms
  {
    slug: "fill-pdf", name: "Fill PDF", blurb: "Complete interactive forms.",
    title: "Fill PDF forms online", description: "Fill in interactive PDF forms (text fields, checkboxes, radio buttons and dropdowns) and sign them.",
    category: "forms", icon: "ClipboardPen", accepts: PDF, workspace: { type: "editor", panel: "forms" }, engine: "browser",
    features: ["Detects existing form fields", "Type on non-interactive forms", "Add signatures and dates", "Optionally flatten"],
    faq: commonEditFaq, related: ["create-pdf-form", "sign-pdf"],
  },
  {
    slug: "create-pdf-form", name: "Create PDF Form", blurb: "Add fillable fields.",
    title: "Create fillable PDF form", description: "Add text fields, checkboxes, radio buttons, dropdowns, date and signature fields to make any PDF fillable.",
    category: "forms", icon: "TextCursorInput", accepts: PDF, workspace: { type: "editor", tool: "field" }, engine: "browser",
    features: ["Text, checkbox, radio, dropdown", "Date and signature fields", "Real AcroForm fields", "Works in any PDF reader"],
    faq: commonEditFaq, related: ["fill-pdf", "edit-pdf"],
  },
];

export const toolBySlug = new Map(tools.map((t) => [t.slug, t]));

export function getTool(slug: string): Tool | undefined {
  return toolBySlug.get(slug);
}

export function toolsIn(category: ToolCategory): Tool[] {
  return tools.filter((t) => t.category === category);
}

export function editorHref(t: Tool): string {
  if (t.workspace.type !== "editor") return `/${t.slug}`;
  const q = new URLSearchParams();
  if (t.workspace.tool) q.set("tool", t.workspace.tool);
  if (t.workspace.panel) q.set("panel", t.workspace.panel);
  const s = q.toString();
  return s ? `/editor?${s}` : "/editor";
}
