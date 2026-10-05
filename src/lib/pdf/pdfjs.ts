/**
 * Lazy, client-only pdf.js loader. pdf.js touches browser globals at import
 * time, so it must never be imported statically from server components.
 */
import type * as PdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

let libPromise: Promise<typeof PdfjsLib> | null = null;

export function loadPdfjs(): Promise<typeof PdfjsLib> {
  if (!libPromise) {
    libPromise = import("pdfjs-dist").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return lib;
    });
  }
  return libPromise;
}

export class PasswordRequiredError extends Error {
  constructor(public incorrect = false) {
    super(incorrect ? "Incorrect password" : "Password required");
  }
}

/** Open a PDF. pdf.js transfers (detaches) the buffer it is given, so we always pass a copy. */
export async function openPdf(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const lib = await loadPdfjs();
  const task = lib.getDocument({
    data: bytes.slice(),
    password,
    isEvalSupported: false,
    enableXfa: false,
  });
  try {
    return await task.promise;
  } catch (err) {
    const e = err as { name?: string; code?: number };
    if (e?.name === "PasswordException") throw new PasswordRequiredError(e.code === 2);
    throw err;
  }
}
