/**
 * qpdf (Apache-2.0) compiled to WebAssembly, run entirely in the browser.
 * Used to remove encryption (with the user's password, or automatically for
 * PDFs that only carry permission restrictions), to add encryption, and to
 * repair damaged files — without uploading anything.
 */

type QpdfInstance = {
  callMain: (args: string[]) => number;
  FS: { writeFile: (p: string, d: Uint8Array) => void; readFile: (p: string) => Uint8Array; unlink: (p: string) => void };
};

export class WrongPasswordError extends Error {
  constructor() { super("Incorrect password"); }
}
export class QpdfError extends Error {}

const WASM_URL = "/qpdf.wasm";

/**
 * A fresh Emscripten instance per call: qpdf calls exit() when it finishes, after
 * which an instance can't be reused. The compiled module is cached by the browser.
 */
async function instance(errors: string[]): Promise<QpdfInstance> {
  const { default: createModule } = await import("@neslinesli93/qpdf-wasm");
  const create = createModule as unknown as (o: Record<string, unknown>) => Promise<QpdfInstance>;
  return create({
    locateFile: () => (typeof window === "undefined" ? "node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm" : WASM_URL),
    noInitialRun: true,
    print: () => {},
    printErr: (s: string) => errors.push(s),
  });
}

async function run(input: Uint8Array, args: (inPath: string, outPath: string) => string[]): Promise<{ code: number; out: Uint8Array | null }> {
  const errors: string[] = [];
  const q = await instance(errors);
  q.FS.writeFile("/in.pdf", input);
  let code: number;
  try {
    code = q.callMain(args("/in.pdf", "/out.pdf"));
  } catch (e) {
    code = typeof (e as { status?: number })?.status === "number" ? (e as { status: number }).status : 2;
  }
  let out: Uint8Array | null = null;
  try { out = q.FS.readFile("/out.pdf").slice(); } catch { /* no output */ }
  return { code, out };
}

/** True if the file declares a security handler (cheap byte scan; false positives only cost a qpdf pass). */
export function isEncrypted(bytes: Uint8Array): boolean {
  const needle = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74]; // "/Encrypt"
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * Remove encryption. An empty password works for PDFs that only restrict
 * printing/copying/editing; PDFs that need a password to open throw
 * WrongPasswordError until the right one is supplied.
 */
export async function decryptPdf(bytes: Uint8Array, password = ""): Promise<Uint8Array> {
  // qpdf exit codes: 0 ok, 2 error, 3 ok with warnings.
  const { code, out } = await run(bytes, (i, o) => [`--password=${password}`, "--decrypt", i, o]);
  if ((code === 0 || code === 3) && out?.length) return out;
  // Failed. This qpdf build doesn't expose stderr or --is-encrypted, so: a file that declares a
  // security handler but won't decrypt with this password is treated as a wrong password.
  if (isEncrypted(bytes)) throw new WrongPasswordError();
  throw new QpdfError("Could not read this PDF");
}

export interface EncryptOptions { userPassword: string; allowPrint: boolean; allowCopy: boolean; allowEdit: boolean }

/** AES-256 encryption with a random owner password. */
export async function encryptPdf(bytes: Uint8Array, o: EncryptOptions): Promise<Uint8Array> {
  const owner = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");
  const { code, out } = await run(bytes, (i, out) => [
    "--encrypt", o.userPassword, owner, "256",
    `--print=${o.allowPrint ? "full" : "none"}`,
    `--extract=${o.allowCopy ? "y" : "n"}`,
    `--modify=${o.allowEdit ? "all" : "none"}`,
    "--", i, out,
  ]);
  if ((code === 0 || code === 3) && out?.length) return out;
  throw new QpdfError("Could not encrypt this PDF");
}

/** Rewrite the file; qpdf reconstructs broken cross-reference tables while reading. */
export async function repairPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const { code, out } = await run(bytes, (i, o) => ["--object-streams=generate", i, o]);
  if ((code === 0 || code === 3) && out?.length) return out;
  // Fallback: pdf-lib parses objects sequentially and doesn't need a valid cross-reference
  // table, so it can rebuild files whose xref/trailer is missing or corrupt.
  try {
    const { PDFDocument } = await import("pdf-lib");
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
    const outDoc = await PDFDocument.create();
    const pages = await outDoc.copyPages(src, src.getPageIndices());
    pages.forEach((p) => outDoc.addPage(p));
    if (!outDoc.getPageCount()) throw new Error("no pages");
    return await outDoc.save({ useObjectStreams: true });
  } catch {
    throw new QpdfError("This file is too damaged to repair");
  }
}
