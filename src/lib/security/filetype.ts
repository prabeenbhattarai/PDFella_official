/**
 * Content sniffing. The extension and the browser-reported MIME type are hints
 * only — the actual bytes decide. Shared by the browser and the API layer.
 */
export type DetectedKind = "pdf" | "png" | "jpg" | "webp" | "gif" | "docx" | "xlsx" | "pptx" | "odt" | "txt" | "unknown";

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

export function sniffBytes(head: Uint8Array, nameHint = ""): DetectedKind {
  // PDF: "%PDF-" may be preceded by up to 1KB of junk per the spec's leniency.
  const window = head.subarray(0, 1024);
  for (let i = 0; i < window.length - 4; i++) {
    if (window[i] === 0x25 && startsWith(window, [0x50, 0x44, 0x46, 0x2d], i + 1)) return "pdf";
  }
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) {
    // OOXML/ODF are ZIPs; the container type is confirmed server-side by reading
    // [Content_Types].xml / mimetype. Here we look for tell-tale entry names.
    const text = new TextDecoder("latin1").decode(head);
    if (text.includes("word/")) return "docx";
    if (text.includes("xl/")) return "xlsx";
    if (text.includes("ppt/")) return "pptx";
    if (text.includes("application/vnd.oasis.opendocument")) return "odt";
    const ext = nameHint.toLowerCase().split(".").pop();
    if (ext === "docx" || ext === "xlsx" || ext === "pptx" || ext === "odt") return ext;
    return "unknown";
  }
  if (looksLikeText(head) && /\.(txt|md|csv)$/i.test(nameHint)) return "txt";
  return "unknown";
}

function looksLikeText(b: Uint8Array) {
  const n = Math.min(b.length, 512);
  for (let i = 0; i < n; i++) {
    const c = b[i];
    if (c === 0) return false;
    if (c < 0x09 || (c > 0x0d && c < 0x20)) return false;
  }
  return true;
}

export async function sniffFile(file: File): Promise<DetectedKind> {
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  return sniffBytes(head, file.name);
}

export const IMAGE_KINDS: DetectedKind[] = ["png", "jpg", "webp", "gif"];
export const OFFICE_KINDS: DetectedKind[] = ["docx", "xlsx", "pptx", "odt"];

export const kindLabel: Record<DetectedKind, string> = {
  pdf: "PDF", png: "PNG", jpg: "JPG", webp: "WEBP", gif: "GIF", docx: "Word", xlsx: "Excel",
  pptx: "PowerPoint", odt: "OpenDocument", txt: "Text", unknown: "Unknown",
};
