/**
 * One handler per endpoint in lib/api/spec.ts. Each calls the same lib/pdf
 * function as the matching website tool, so the API and the site always
 * produce the same result.
 */
import JSZip from "jszip";
import {
  addHeaderFooter, addWatermark, applyPagePlan, extractPages, flattenPdf, imagesToPdf, loadPdf, mergePdfs, pdfToText, splitPdf,
  type PagePlanItem, type Position, type SplitMode,
} from "@/lib/pdf/ops";
import { decryptPdf, encryptPdf, isEncrypted, repairPdf, WrongPasswordError } from "@/lib/pdf/qpdf";
import { parsePageRanges } from "@/lib/utils";
import { ApiError } from "./errors";
import type { Input, InputFile } from "./input";

export interface Output { bytes: Uint8Array; contentType: string; fileName: string }
type Handler = (input: Input) => Promise<Output>;

const pdf = (bytes: Uint8Array, fileName: string): Output => ({ bytes, contentType: "application/pdf", fileName });
const baseName = (f: InputFile) => f.name.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "-").slice(0, 80) || "document";
const str = (v: unknown) => (v === undefined ? undefined : String(v));
const num = (v: unknown) => Number(v);

/**
 * Open a PDF the way the website does: restriction-only encryption is removed
 * silently; a PDF that needs a password to open needs `password`.
 */
async function openInput(f: InputFile, password: string | undefined): Promise<{ bytes: Uint8Array; pageCount: number }> {
  let bytes = f.bytes;
  if (isEncrypted(bytes)) {
    try {
      bytes = await decryptPdf(bytes, password ?? "");
    } catch (e) {
      if (e instanceof WrongPasswordError) throw new ApiError(password ? "wrong_password" : "password_required", password ? "The password doesn't open this PDF." : "This PDF needs a password to open. Send it as `password`.");
      throw new ApiError("damaged", "This PDF couldn't be read. Try /v1/repair first.");
    }
  }
  try {
    return { bytes, pageCount: (await loadPdf(bytes)).getPageCount() };
  } catch {
    throw new ApiError("damaged", "This PDF couldn't be read. Try /v1/repair first.");
  }
}

function pageList(spec: unknown, count: number, name: string): number[] {
  if (spec === undefined) return Array.from({ length: count }, (_, i) => i);
  let pages: number[];
  try {
    pages = parsePageRanges(String(spec), count);
  } catch (e) {
    throw new ApiError("invalid_request", `\`${name}\`: ${(e as Error).message}.`);
  }
  if (!pages.length) throw new ApiError("invalid_request", `\`${name}\` doesn't match any page (the PDF has ${count}).`);
  return pages;
}

const single = (input: Input) => input.files.file[0];

export const OPERATIONS: Record<string, Handler> = {
  async merge(input) {
    const docs = [];
    for (const f of input.files.files) docs.push((await openInput(f, str(input.params.password))).bytes);
    return pdf(await mergePdfs(docs), "merged.pdf");
  },

  async split(input) {
    const f = single(input);
    const { bytes, pageCount } = await openInput(f, str(input.params.password));
    let mode: SplitMode;
    if (input.params.mode === "ranges") {
      const ranges = str(input.params.ranges);
      if (!ranges) throw new ApiError("invalid_request", "`ranges` is required when `mode=ranges`.");
      mode = { type: "ranges", groups: ranges.split(";").map((r) => pageList(r, pageCount, "ranges")) };
    } else if (input.params.mode === "odd-even") mode = { type: "oddEven" };
    else mode = { type: "every", n: num(input.params.every) };
    const parts = await splitPdf(bytes, mode, pageCount);
    const zip = new JSZip();
    for (const p of parts) zip.file(`${baseName(f)}-${p.name}.pdf`, p.bytes);
    return { bytes: await zip.generateAsync({ type: "uint8array" }), contentType: "application/zip", fileName: `${baseName(f)}-split.zip` };
  },

  async "extract-pages"(input) {
    const f = single(input);
    const { bytes, pageCount } = await openInput(f, str(input.params.password));
    return pdf(await extractPages(bytes, pageList(input.params.pages, pageCount, "pages")), `${baseName(f)}-extracted.pdf`);
  },

  async "delete-pages"(input) {
    const f = single(input);
    const { bytes, pageCount } = await openInput(f, str(input.params.password));
    const remove = new Set(pageList(input.params.pages, pageCount, "pages"));
    if (remove.size === pageCount) throw new ApiError("invalid_request", "You can't delete every page.");
    const plan: PagePlanItem[] = [];
    for (let i = 0; i < pageCount; i++) if (!remove.has(i)) plan.push({ sourceIndex: i, rotation: 0 });
    return pdf(await applyPagePlan(bytes, plan), `${baseName(f)}-edited.pdf`);
  },

  async rotate(input) {
    const f = single(input);
    const { bytes, pageCount } = await openInput(f, str(input.params.password));
    const targets = new Set(pageList(input.params.pages, pageCount, "pages"));
    const angle = num(input.params.angle);
    const plan = Array.from({ length: pageCount }, (_, i): PagePlanItem => ({ sourceIndex: i, rotation: targets.has(i) ? angle : 0 }));
    return pdf(await applyPagePlan(bytes, plan), `${baseName(f)}-rotated.pdf`);
  },

  async reorder(input) {
    const f = single(input);
    const { bytes, pageCount } = await openInput(f, str(input.params.password));
    const plan = pageList(input.params.order, pageCount, "order").map((i): PagePlanItem => ({ sourceIndex: i, rotation: 0 }));
    return pdf(await applyPagePlan(bytes, plan), `${baseName(f)}-reordered.pdf`);
  },

  async watermark(input) {
    const f = single(input);
    const p = input.params;
    const image = input.files.image?.[0];
    const text = str(p.text);
    if (!image && !text) throw new ApiError("invalid_request", "Send `text` or an `image` file.");
    if (image && text) throw new ApiError("invalid_request", "Send either `text` or an `image` file, not both.");
    const { bytes, pageCount } = await openInput(f, str(p.password));
    const out = await addWatermark(bytes, {
      kind: image ? "image" : "text",
      text,
      image: image ? `data:image/${image.kind === "png" ? "png" : "jpeg"};base64,${Buffer.from(image.bytes).toString("base64")}` : undefined,
      font: p.font as "Helvetica" | "Times" | "Courier",
      bold: p.bold === true,
      size: num(p.size),
      color: String(p.color),
      opacity: num(p.opacity),
      rotation: num(p.rotation),
      position: p.position as Position | "tile",
      imageScale: num(p.image_scale),
      pages: pageList(p.pages, pageCount, "pages"),
      layer: p.layer as "over" | "under",
    });
    return pdf(out, `${baseName(f)}-watermarked.pdf`);
  },

  async "page-numbers"(input) {
    const f = single(input);
    const p = input.params;
    const { bytes, pageCount } = await openInput(f, str(p.password));
    const [v, h] = String(p.position).split("-");
    const out = await addHeaderFooter(bytes, {
      [h]: String(p.format),
      where: v === "top" ? "header" : "footer",
      size: num(p.size), color: String(p.color), margin: num(p.margin), startAt: num(p.start_at),
      pages: pageList(p.pages, pageCount, "pages"), docName: baseName(f),
    });
    return pdf(out, `${baseName(f)}-numbered.pdf`);
  },

  async "header-footer"(input) {
    const f = single(input);
    const p = input.params;
    const slots = (where: "header" | "footer") => ({ left: str(p[`${where}_left`]), center: str(p[`${where}_center`]), right: str(p[`${where}_right`]) });
    const header = slots("header"), footer = slots("footer");
    const any = (s: ReturnType<typeof slots>) => Object.values(s).some(Boolean);
    if (!any(header) && !any(footer)) throw new ApiError("invalid_request", "Send at least one header_* or footer_* field.");
    const opened = await openInput(f, str(p.password));
    let bytes = opened.bytes;
    const pageCount = opened.pageCount;
    const common = {
      size: num(p.size), color: String(p.color), margin: num(p.margin), startAt: num(p.start_at),
      font: p.font as "Helvetica" | "Times" | "Courier", pages: pageList(p.pages, pageCount, "pages"), docName: str(p.name) ?? baseName(f),
    };
    if (any(header)) bytes = await addHeaderFooter(bytes, { ...header, where: "header", ...common });
    if (any(footer)) bytes = await addHeaderFooter(bytes, { ...footer, where: "footer", ...common });
    return pdf(bytes, `${baseName(f)}-stamped.pdf`);
  },

  async "images-to-pdf"(input) {
    const p = input.params;
    const out = await imagesToPdf(
      input.files.files.map((f) => ({ bytes: f.bytes, type: f.kind })),
      { pageSize: p.page_size as "fit" | "a4" | "letter", orientation: p.orientation as "auto" | "portrait" | "landscape", margin: num(p.margin) },
    );
    return pdf(out, "images.pdf");
  },

  async "pdf-to-text"(input) {
    const f = single(input);
    const { bytes } = await openInput(f, str(input.params.password));
    const text = await pdfToText(bytes);
    return { bytes: new TextEncoder().encode(text), contentType: "text/plain; charset=utf-8", fileName: `${baseName(f)}.txt` };
  },

  async flatten(input) {
    const f = single(input);
    const { bytes } = await openInput(f, str(input.params.password));
    return pdf(await flattenPdf(bytes), `${baseName(f)}-flattened.pdf`);
  },

  async protect(input) {
    const f = single(input);
    const p = input.params;
    const pw = String(p.new_password);
    if (pw.length > 128) throw new ApiError("invalid_request", "`new_password` must be 128 characters or fewer.");
    const { bytes } = await openInput(f, str(p.password));
    const out = await encryptPdf(bytes, { userPassword: pw, allowPrint: p.allow_print === true, allowCopy: p.allow_copy === true, allowEdit: p.allow_edit === true });
    return pdf(out, `${baseName(f)}-protected.pdf`);
  },

  async unlock(input) {
    const f = single(input);
    if (!isEncrypted(f.bytes)) throw new ApiError("invalid_request", "This PDF isn't encrypted.");
    const { bytes } = await openInput(f, str(input.params.password));
    return pdf(bytes, `${baseName(f)}-unlocked.pdf`);
  },

  async repair(input) {
    const f = single(input);
    try {
      return pdf(await repairPdf(f.bytes), `${baseName(f)}-repaired.pdf`);
    } catch {
      throw new ApiError("damaged", "This file is too damaged to repair.");
    }
  },
};
