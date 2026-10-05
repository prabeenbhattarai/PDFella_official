import "server-only";
import type { ServerOp } from "../tools";
import type { DetectedKind } from "../security/filetype";

/** What each server operation accepts and produces, plus a strict parameter whitelist. */
export const OPS: Record<ServerOp, { accepts: DetectedKind[]; output: string; contentType: string; maxFiles: number; params: (p: Record<string, unknown>) => Record<string, unknown> }> = {
  ocr: { accepts: ["pdf"], output: "pdf", contentType: "application/pdf", maxFiles: 1, params: (p) => ({ language: lang(p.language) }) },
  "pdf-to-docx": { accepts: ["pdf"], output: "docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", maxFiles: 1, params: (p) => ({ ocr: p.ocr === true, language: lang(p.language) }) },
  "pdf-to-xlsx": { accepts: ["pdf"], output: "xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", maxFiles: 1, params: () => ({}) },
  "pdf-to-pptx": { accepts: ["pdf"], output: "pptx", contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", maxFiles: 1, params: () => ({}) },
  "pdf-to-html": { accepts: ["pdf"], output: "html", contentType: "text/html", maxFiles: 1, params: () => ({}) },
  "office-to-pdf": { accepts: ["docx", "xlsx", "pptx", "odt", "txt"], output: "pdf", contentType: "application/pdf", maxFiles: 1, params: () => ({}) },
  protect: { accepts: ["pdf"], output: "pdf", contentType: "application/pdf", maxFiles: 1, params: (p) => ({ password: pw(p.password), allowPrint: p.allowPrint !== false, allowCopy: p.allowCopy === true }) },
  unlock: { accepts: ["pdf"], output: "pdf", contentType: "application/pdf", maxFiles: 1, params: (p) => ({ password: pw(p.password) }) },
  repair: { accepts: ["pdf"], output: "pdf", contentType: "application/pdf", maxFiles: 1, params: () => ({}) },
  compress: { accepts: ["pdf"], output: "pdf", contentType: "application/pdf", maxFiles: 1, params: (p) => ({ preset: ["recommended", "high", "quality"].includes(String(p.preset)) ? p.preset : "recommended" }) },
  redact: { accepts: ["pdf"], output: "pdf", contentType: "application/pdf", maxFiles: 1, params: (p) => ({ regions: regions(p.regions) }) },
  "edit-text": { accepts: ["pdf"], output: "pdf", contentType: "application/pdf", maxFiles: 1, params: (p) => ({ regions: regions(p.regions) }) },
};

export class ParamError extends Error {}

function lang(v: unknown) {
  const s = String(v ?? "eng");
  if (!/^[a-z_]{3,10}(\+[a-z_]{3,10}){0,3}$/.test(s)) throw new ParamError("Invalid OCR language");
  return s;
}
function pw(v: unknown) {
  const s = String(v ?? "");
  if (!s || s.length > 128) throw new ParamError("Invalid password");
  return s;
}
function regions(v: unknown) {
  if (!Array.isArray(v) || v.length > 5000) throw new ParamError("Invalid regions");
  return v.map((r) => {
    const o = r as { pageIndex: unknown; rect: unknown; fill?: unknown };
    const rect = Array.isArray(o.rect) ? o.rect.map(Number) : [];
    if (!Number.isInteger(o.pageIndex) || rect.length !== 4 || rect.some((n) => !Number.isFinite(n))) throw new ParamError("Invalid region");
    const fill = typeof o.fill === "string" && /^#[0-9a-f]{6}$/i.test(o.fill) ? o.fill : "#000000";
    return { pageIndex: o.pageIndex as number, rect, fill };
  });
}

export function isServerOp(v: unknown): v is ServerOp {
  return typeof v === "string" && v in OPS;
}

export const EXT: Partial<Record<DetectedKind, string>> = { pdf: "pdf", docx: "docx", xlsx: "xlsx", pptx: "pptx", odt: "odt", txt: "txt", png: "png", jpg: "jpg", webp: "webp" };
