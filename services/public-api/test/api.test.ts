import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { ENDPOINTS } from "@/lib/api/spec";

process.env.API_DATA_DIR = mkdtempSync(path.join(tmpdir(), "pdfella-api-"));
const { createApp } = await import("../src/app");
const { keyStore, newKey } = await import("../src/keys");
const { OPERATIONS } = await import("../src/operations");

const sample = readFileSync(path.resolve("tests/fixtures/sample.pdf"));
const app = createApp();
let key = "";

beforeAll(async () => {
  const k = newKey("test");
  await keyStore().create(k.record);
  key = k.key;
});

function post(endpoint: string, fields: Record<string, string | Buffer | Buffer[]>, auth = true) {
  const form = new FormData();
  for (const [name, v] of Object.entries(fields)) {
    for (const item of Array.isArray(v) ? v : [v]) {
      if (typeof item === "string") form.append(name, item);
      else form.append(name, new Blob([new Uint8Array(item)]), "in.pdf");
    }
  }
  return app.request(`/v1${endpoint}`, { method: "POST", body: form, headers: auth ? { authorization: `Bearer ${key}` } : {} });
}
const pages = async (res: Response) => (await PDFDocument.load(new Uint8Array(await res.arrayBuffer()))).getPageCount();

describe("public API", () => {
  it("has an operation for every documented endpoint", () => {
    for (const e of ENDPOINTS) expect(OPERATIONS[e.id], e.id).toBeTypeOf("function");
  });

  it("requires a valid key", async () => {
    expect((await post("/merge", { files: [sample, sample] }, false)).status).toBe(401);
    const res = await app.request("/v1/merge", { method: "POST", headers: { authorization: "Bearer pdfella_sk_notarealkeynotarealkey" } });
    expect(res.status).toBe(401);
  });

  it("merges PDFs", async () => {
    const res = await post("/merge", { files: [sample, sample] });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(await pages(res)).toBe(2 * (await PDFDocument.load(sample)).getPageCount());
  });

  it("deletes and extracts pages", async () => {
    expect(await pages(await post("/delete-pages", { file: sample, pages: "1" }))).toBe(2);
    expect(await pages(await post("/extract-pages", { file: sample, pages: "3,1" }))).toBe(2);
  });

  it("protects, then needs the password to unlock", async () => {
    const locked = Buffer.from(await (await post("/protect", { file: sample, new_password: "s3cret" })).arrayBuffer());
    const missing = await post("/unlock", { file: locked });
    expect(missing.status).toBe(422);
    expect((await missing.json()).error.code).toBe("password_required");
    expect((await post("/unlock", { file: locked, password: "nope" })).status).toBe(422);
    expect(await pages(await post("/unlock", { file: locked, password: "s3cret" }))).toBe(3);
  });

  it("rejects files by content, not name", async () => {
    const res = await post("/rotate", { file: Buffer.from("not a pdf at all") });
    expect(res.status).toBe(415);
    expect((await res.json()).error.code).toBe("unsupported_type");
  });

  it("validates params against the spec", async () => {
    const res = await post("/rotate", { file: sample, angle: "45" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("angle");
  });

  it("extracts text", async () => {
    const res = await post("/pdf-to-text", { file: readFileSync(path.resolve("tests/fixtures/words.pdf")) });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("invoice total");
  });

  it("serves an OpenAPI document covering every endpoint", async () => {
    const doc = await (await app.request("/v1/openapi.json")).json();
    for (const e of ENDPOINTS) expect(doc.paths[`/v1${e.path}`], e.path).toBeDefined();
  });

  it("meters usage per key", async () => {
    const me = await (await app.request("/v1/me", { headers: { authorization: `Bearer ${key}` } })).json();
    expect(me.usage[0].requests).toBeGreaterThan(5);
  });
});
