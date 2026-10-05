import "server-only";
import { mkdir, readFile, rm, stat, writeFile, open } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { signBlob } from "./tokens";

/**
 * Temporary object storage. Objects live under tmp/{jobId}/… and are only ever
 * reachable through short-lived signed URLs.
 */
export interface ObjectStore {
  signedUploadUrl(key: string, contentType: string, maxBytes: number): Promise<string>;
  signedDownloadUrl(key: string, downloadName: string): Promise<string>;
  /** Size in bytes, or null if missing. */
  size(key: string): Promise<number | null>;
  /** First bytes of an object, for content sniffing. */
  head(key: string, bytes: number): Promise<Uint8Array>;
  deletePrefix(prefix: string): Promise<void>;
}

// ───────────────────────── Google Cloud Storage / Firebase Storage

class GcsStore implements ObjectStore {
  private async bucket() {
    const { getStorage } = await import("firebase-admin/storage");
    const { adminApp } = await import("./firebase");
    return getStorage(adminApp()).bucket(config.bucket);
  }
  async signedUploadUrl(key: string, contentType: string, maxBytes: number) {
    const [url] = await (await this.bucket()).file(key).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + config.signedUrlTtlSec * 1000,
      contentType,
      extensionHeaders: { "x-goog-content-length-range": `0,${maxBytes}` },
    });
    return url;
  }
  async signedDownloadUrl(key: string, downloadName: string) {
    const [url] = await (await this.bucket()).file(key).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + config.signedUrlTtlSec * 1000,
      responseDisposition: `attachment; filename="${downloadName.replace(/["\\\r\n]/g, "_")}"`,
    });
    return url;
  }
  async size(key: string) {
    const f = (await this.bucket()).file(key);
    const [exists] = await f.exists();
    if (!exists) return null;
    const [meta] = await f.getMetadata();
    return Number(meta.size ?? 0);
  }
  async head(key: string, bytes: number) {
    const [buf] = await (await this.bucket()).file(key).download({ start: 0, end: bytes - 1 });
    return new Uint8Array(buf);
  }
  async deletePrefix(prefix: string) {
    await (await this.bucket()).deleteFiles({ prefix, force: true });
  }
}

// ───────────────────────── Local filesystem (development)

class LocalStore implements ObjectStore {
  private file(key: string) {
    const root = path.resolve(config.localDataDir);
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error("Invalid key");
    return p;
  }
  private url(key: string, method: "GET" | "PUT", maxBytes = 0, name?: string) {
    const expires = Date.now() + config.signedUrlTtlSec * 1000;
    const q = new URLSearchParams({ e: String(expires), m: String(maxBytes), s: signBlob(key, method, expires, maxBytes) });
    if (name) q.set("n", name);
    return `${config.appUrl}/api/blob/${key.split("/").map(encodeURIComponent).join("/")}?${q}`;
  }
  async signedUploadUrl(key: string, _ct: string, maxBytes: number) { return this.url(key, "PUT", maxBytes); }
  async signedDownloadUrl(key: string, name: string) { return this.url(key, "GET", 0, name); }
  async size(key: string) {
    try { return (await stat(this.file(key))).size; } catch { return null; }
  }
  async head(key: string, bytes: number) {
    const fh = await open(this.file(key), "r");
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fh.read(buf, 0, bytes, 0);
      return new Uint8Array(buf.subarray(0, bytesRead));
    } finally { await fh.close(); }
  }
  async deletePrefix(prefix: string) {
    await rm(this.file(prefix), { recursive: true, force: true });
  }
  // Used by /api/blob in local mode only.
  async write(key: string, data: Uint8Array) {
    const p = this.file(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  async read(key: string) { return readFile(this.file(key)); }
}

let store: ObjectStore | null = null;
export function getStore(): ObjectStore {
  store ??= config.storage === "gcs" ? new GcsStore() : new LocalStore();
  return store;
}
export function getLocalStore(): LocalStore | null {
  const s = getStore();
  return s instanceof LocalStore ? s : null;
}
