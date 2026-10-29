/**
 * The public PDFella API, described once. The API service (services/public-api)
 * validates requests and builds its OpenAPI document from this, and the
 * /developers page renders its reference from it, so the docs can't drift from
 * what the service accepts.
 *
 * Every endpoint runs the same code as the matching browser tool (lib/pdf), so
 * improvements to a tool reach API users with the next deploy. Changes here must
 * stay backwards compatible within a version: add optional params, never rename
 * or remove; anything breaking goes into /v2.
 */

export const API_VERSION = "v1";
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "https://api.pdfella.com").replace(/\/+$/, "");

/** Per-file and per-request size limits (bytes). */
export const API_LIMITS = {
  maxFileBytes: 50 * 1024 * 1024,
  maxRequestBytes: 100 * 1024 * 1024,
  maxFiles: 50,
  defaultRatePerMinute: 60,
};

export type ParamType = "string" | "integer" | "number" | "boolean" | "pages" | "color";

export interface ApiParam {
  name: string;
  type: ParamType;
  description: string;
  required?: boolean;
  default?: string | number | boolean;
  enum?: readonly string[];
  min?: number;
  max?: number;
  example?: string | number | boolean;
}

export interface ApiFileField {
  name: string;
  accepts: readonly ("pdf" | "png" | "jpg")[];
  multiple?: boolean;
  /** Minimum number of files when `multiple`. */
  min?: number;
  required?: boolean;
  description: string;
}

export interface ApiEndpoint {
  id: string;
  path: `/${string}`;
  title: string;
  summary: string;
  group: "Organise" | "Stamp" | "Convert" | "Security";
  /** The website tool this endpoint mirrors (lib/tools.ts slug). */
  tool: string;
  files: ApiFileField[];
  params: ApiParam[];
  returns: { contentType: string; description: string };
}

const PDF_FILE: ApiFileField = { name: "file", accepts: ["pdf"], required: true, description: "The PDF to process." };
const PAGES = (description = "Pages to apply this to, e.g. `1-3,5,8-`. Defaults to every page."): ApiParam =>
  ({ name: "pages", type: "pages", description, example: "1-3,5" });
const PDF_OUT = (description: string) => ({ contentType: "application/pdf", description });
const POSITIONS = ["top-left", "top-center", "top-right", "middle-left", "center", "middle-right", "bottom-left", "bottom-center", "bottom-right"] as const;
const FONTS = ["Helvetica", "Times", "Courier"] as const;

/**
 * Accepted by every endpoint that reads a PDF: opens password-protected input.
 * PDFs that only restrict printing or copying are opened without it.
 */
export const PASSWORD_PARAM: ApiParam = { name: "password", type: "string", description: "Password to open the input PDF, if it needs one." };

export const ENDPOINTS: ApiEndpoint[] = [
  // ───────── organise
  {
    id: "merge", path: "/merge", group: "Organise", tool: "merge-pdf",
    title: "Merge PDFs", summary: "Combine several PDFs into one, in the order they are sent.",
    files: [{ name: "files", accepts: ["pdf"], multiple: true, min: 2, required: true, description: "Two or more PDFs, merged in the order given." }],
    params: [],
    returns: PDF_OUT("The merged PDF."),
  },
  {
    id: "split", path: "/split", group: "Organise", tool: "split-pdf",
    title: "Split PDF", summary: "Divide a PDF into several files by page ranges, every N pages, or odd and even pages.",
    files: [PDF_FILE],
    params: [
      { name: "mode", type: "string", enum: ["ranges", "every", "odd-even"], default: "every", description: "How to split." },
      { name: "ranges", type: "string", description: "With `mode=ranges`: page ranges separated by `;`, one output file each, e.g. `1-3;4-6;7-`.", example: "1-3;4-" },
      { name: "every", type: "integer", min: 1, default: 1, description: "With `mode=every`: pages per output file." },
    ],
    returns: { contentType: "application/zip", description: "A ZIP archive with one PDF per part." },
  },
  {
    id: "extract-pages", path: "/extract-pages", group: "Organise", tool: "extract-pdf-pages",
    title: "Extract pages", summary: "Create a new PDF from selected pages, in the order given.",
    files: [PDF_FILE],
    params: [{ ...PAGES("Pages to keep, in order, e.g. `3,1-2`."), required: true }],
    returns: PDF_OUT("A PDF with only the selected pages."),
  },
  {
    id: "delete-pages", path: "/delete-pages", group: "Organise", tool: "delete-pdf-pages",
    title: "Delete pages", summary: "Remove pages from a PDF.",
    files: [PDF_FILE],
    params: [{ ...PAGES("Pages to remove, e.g. `2,5-7`."), required: true }],
    returns: PDF_OUT("The PDF without the removed pages."),
  },
  {
    id: "rotate", path: "/rotate", group: "Organise", tool: "rotate-pdf",
    title: "Rotate pages", summary: "Rotate pages clockwise by 90, 180 or 270 degrees.",
    files: [PDF_FILE],
    params: [
      { name: "angle", type: "integer", enum: ["90", "180", "270"], default: 90, description: "Clockwise rotation in degrees." },
      PAGES(),
    ],
    returns: PDF_OUT("The rotated PDF."),
  },
  {
    id: "reorder", path: "/reorder", group: "Organise", tool: "rearrange-pdf-pages",
    title: "Reorder pages", summary: "Put pages in a new order. Pages you leave out are removed.",
    files: [PDF_FILE],
    params: [{ name: "order", type: "pages", required: true, description: "The new page order, e.g. `3,1,2,4-`.", example: "3,1,2,4-" }],
    returns: PDF_OUT("The reordered PDF."),
  },

  // ───────── stamp
  {
    id: "watermark", path: "/watermark", group: "Stamp", tool: "watermark-pdf",
    title: "Add a watermark", summary: "Stamp text or an image (PNG/JPG) on pages, once or tiled.",
    files: [PDF_FILE, { name: "image", accepts: ["png", "jpg"], description: "Image watermark. Send this or `text`." }],
    params: [
      { name: "text", type: "string", description: "Text watermark. Send this or an `image` file.", example: "CONFIDENTIAL" },
      { name: "font", type: "string", enum: FONTS, default: "Helvetica", description: "Text font." },
      { name: "bold", type: "boolean", default: true, description: "Bold text." },
      { name: "size", type: "number", min: 4, max: 400, default: 48, description: "Font size in points." },
      { name: "color", type: "color", default: "#d1242f", description: "Text colour as `#rrggbb`." },
      { name: "opacity", type: "number", min: 0, max: 1, default: 0.3, description: "Opacity from 0 to 1." },
      { name: "rotation", type: "number", min: -360, max: 360, default: 45, description: "Counter-clockwise rotation in degrees." },
      { name: "position", type: "string", enum: [...POSITIONS, "tile"], default: "center", description: "Where to place it; `tile` repeats it across the page." },
      { name: "image_scale", type: "number", min: 0.01, max: 10, default: 0.3, description: "Image watermark scale (1 = image pixels as points)." },
      { name: "layer", type: "string", enum: ["over", "under"], default: "over", description: "Draw over or under the page content." },
      PAGES(),
    ],
    returns: PDF_OUT("The watermarked PDF."),
  },
  {
    id: "page-numbers", path: "/page-numbers", group: "Stamp", tool: "add-page-numbers-to-pdf",
    title: "Add page numbers", summary: "Number pages with a format of your choice.",
    files: [PDF_FILE],
    params: [
      { name: "format", type: "string", default: "{page}", description: "Text to stamp. Tokens: `{page}`, `{pages}`, `{date}`, `{name}`.", example: "Page {page} of {pages}" },
      { name: "position", type: "string", enum: ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"], default: "bottom-center", description: "Where on the page." },
      { name: "size", type: "number", min: 4, max: 72, default: 11, description: "Font size in points." },
      { name: "color", type: "color", default: "#15171c", description: "Text colour as `#rrggbb`." },
      { name: "margin", type: "number", min: 0, max: 200, default: 28, description: "Distance from the page edge in points." },
      { name: "start_at", type: "integer", min: 0, default: 1, description: "Number of the first numbered page." },
      PAGES("Pages to number, e.g. `2-`. Defaults to every page."),
    ],
    returns: PDF_OUT("The numbered PDF."),
  },
  {
    id: "header-footer", path: "/header-footer", group: "Stamp", tool: "add-header-and-footer-to-pdf",
    title: "Add header and footer", summary: "Add left, centre and right text to the top and bottom of pages.",
    files: [PDF_FILE],
    params: [
      ...(["header", "footer"] as const).flatMap((where) => (["left", "center", "right"] as const).map((slot): ApiParam => ({
        name: `${where}_${slot}`, type: "string", description: `${where === "header" ? "Header" : "Footer"} text, ${slot}. Tokens: \`{page}\`, \`{pages}\`, \`{date}\`, \`{name}\`.`,
        ...(where === "footer" && slot === "right" ? { example: "Page {page} of {pages}" } : where === "header" && slot === "left" ? { example: "Quarterly report" } : {}),
      }))),
      { name: "font", type: "string", enum: FONTS, default: "Helvetica", description: "Text font." },
      { name: "size", type: "number", min: 4, max: 72, default: 10, description: "Font size in points." },
      { name: "color", type: "color", default: "#15171c", description: "Text colour as `#rrggbb`." },
      { name: "margin", type: "number", min: 0, max: 200, default: 28, description: "Distance from the page edge in points." },
      { name: "start_at", type: "integer", min: 0, default: 1, description: "Value of `{page}` on the first stamped page." },
      { name: "name", type: "string", description: "Value of `{name}`. Defaults to the file name without extension." },
      PAGES(),
    ],
    returns: PDF_OUT("The PDF with header and footer."),
  },

  // ───────── convert
  {
    id: "images-to-pdf", path: "/images-to-pdf", group: "Convert", tool: "jpg-to-pdf",
    title: "Images to PDF", summary: "Turn JPG and PNG images into a PDF, one image per page.",
    files: [{ name: "files", accepts: ["png", "jpg"], multiple: true, min: 1, required: true, description: "JPG or PNG images, one page each, in the order given." }],
    params: [
      { name: "page_size", type: "string", enum: ["fit", "a4", "letter"], default: "fit", description: "`fit` makes each page the size of its image." },
      { name: "orientation", type: "string", enum: ["auto", "portrait", "landscape"], default: "auto", description: "Page orientation for A4 and Letter." },
      { name: "margin", type: "number", min: 0, max: 200, default: 0, description: "Margin around each image in points." },
    ],
    returns: PDF_OUT("A PDF with one page per image."),
  },
  {
    id: "pdf-to-text", path: "/pdf-to-text", group: "Convert", tool: "pdf-to-text",
    title: "PDF to text", summary: "Extract the text of every page. Scanned pages without a text layer return no text.",
    files: [PDF_FILE],
    params: [],
    returns: { contentType: "text/plain; charset=utf-8", description: "Plain text, with a divider line before each page." },
  },
  {
    id: "flatten", path: "/flatten", group: "Convert", tool: "flatten-pdf",
    title: "Flatten PDF", summary: "Bake form fields into the page so they can no longer be edited.",
    files: [PDF_FILE],
    params: [],
    returns: PDF_OUT("The flattened PDF."),
  },

  // ───────── security
  {
    id: "protect", path: "/protect", group: "Security", tool: "protect-pdf",
    title: "Protect PDF", summary: "Encrypt a PDF with a password (AES-256).",
    files: [PDF_FILE],
    params: [
      { name: "new_password", type: "string", required: true, description: "Password needed to open the output (1–128 characters)." },
      { name: "allow_print", type: "boolean", default: true, description: "Allow printing." },
      { name: "allow_copy", type: "boolean", default: false, description: "Allow copying text and images." },
      { name: "allow_edit", type: "boolean", default: false, description: "Allow editing." },
    ],
    returns: PDF_OUT("The encrypted PDF."),
  },
  {
    id: "unlock", path: "/unlock", group: "Security", tool: "unlock-pdf",
    title: "Unlock PDF", summary: "Remove the password and printing/copying restrictions from a PDF.",
    files: [PDF_FILE],
    params: [],
    returns: PDF_OUT("The PDF without encryption."),
  },
  {
    id: "repair", path: "/repair", group: "Security", tool: "repair-pdf",
    title: "Repair PDF", summary: "Rebuild a damaged PDF's structure so it opens again.",
    files: [PDF_FILE],
    params: [],
    returns: PDF_OUT("The repaired PDF."),
  },
];

/** Every PDF-reading endpoint also takes the optional input password. */
export function paramsOf(e: ApiEndpoint): ApiParam[] {
  return e.files.some((f) => f.accepts.includes("pdf")) ? [...e.params, PASSWORD_PARAM] : e.params;
}

export const ERROR_CODES: { code: string; status: number; description: string }[] = [
  { code: "unauthorized", status: 401, description: "Missing or invalid API key." },
  { code: "key_revoked", status: 403, description: "This API key has been revoked." },
  { code: "not_found", status: 404, description: "No such endpoint." },
  { code: "invalid_request", status: 400, description: "A file or parameter is missing or invalid. `message` says which." },
  { code: "unsupported_type", status: 415, description: "A file isn't the type the endpoint accepts (checked from its contents, not its name)." },
  { code: "too_large", status: 413, description: "A file or the whole request is over the size limit." },
  { code: "password_required", status: 422, description: "The PDF needs a password to open; send it as `password`." },
  { code: "wrong_password", status: 422, description: "The password doesn't open this PDF." },
  { code: "damaged", status: 422, description: "The PDF couldn't be read. Try `/repair` first." },
  { code: "rate_limited", status: 429, description: "Too many requests. Wait for the number of seconds in `Retry-After`." },
  { code: "internal", status: 500, description: "Something went wrong on our side." },
];
