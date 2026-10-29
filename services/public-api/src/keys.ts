/**
 * API keys and usage. Keys look like `pdfella_sk_<random>`; only their SHA-256
 * hash is stored, so a leaked database doesn't leak working keys. The full key
 * is shown once, when it's created.
 *
 * Backends: `file` (default, for local development: API_DATA_DIR/api-keys.json)
 * or `firestore` (production: collections `api_keys` and `api_usage`).
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ApiKey {
  id: string;
  name: string;
  /** First characters of the key, safe to display. */
  prefix: string;
  hash: string;
  createdAt: string;
  revokedAt?: string;
  ratePerMinute?: number;
}

export interface UsageDay { keyId: string; date: string; requests: number; errors: number; bytesIn: number; endpoints: Record<string, number> }

export interface KeyStore {
  findByHash(hash: string): Promise<ApiKey | null>;
  list(): Promise<ApiKey[]>;
  create(key: ApiKey): Promise<void>;
  revoke(id: string): Promise<boolean>;
  recordUsage(keyId: string, endpoint: string, ok: boolean, bytesIn: number): Promise<void>;
  usage(keyId: string, days: number): Promise<UsageDay[]>;
}

const PREFIX = "pdfella_sk_";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
export const looksLikeKey = (key: string) => key.startsWith(PREFIX) && key.length >= PREFIX.length + 20 && key.length < 200;
const today = () => new Date().toISOString().slice(0, 10);
const daysBack = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));

export function newKey(name: string, ratePerMinute?: number): { key: string; record: ApiKey } {
  const key = PREFIX + randomBytes(24).toString("base64url");
  return {
    key,
    record: { id: randomBytes(6).toString("hex"), name, prefix: key.slice(0, PREFIX.length + 6), hash: hashKey(key), createdAt: new Date().toISOString(), ...(ratePerMinute ? { ratePerMinute } : {}) },
  };
}

// ───────── file backend

class FileStore implements KeyStore {
  private file: string;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(dir: string) {
    this.file = path.join(dir, "api-keys.json");
  }
  private async read(): Promise<{ keys: ApiKey[]; usage: UsageDay[] }> {
    try {
      return JSON.parse(await readFile(this.file, "utf8"));
    } catch {
      return { keys: [], usage: [] };
    }
  }
  /** Serialise read-modify-write so concurrent requests don't lose updates. */
  private update(fn: (d: { keys: ApiKey[]; usage: UsageDay[] }) => void) {
    const next = this.chain.then(async () => {
      const d = await this.read();
      fn(d);
      await mkdir(path.dirname(this.file), { recursive: true });
      // Write-then-rename so a concurrent read never sees a half-written file.
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(d, null, 2));
      await rename(tmp, this.file);
    });
    this.chain = next.catch(() => {});
    return next;
  }
  async findByHash(hash: string) {
    return (await this.read()).keys.find((k) => k.hash === hash) ?? null;
  }
  async list() {
    return (await this.read()).keys;
  }
  async create(key: ApiKey) {
    await this.update((d) => void d.keys.push(key));
  }
  async revoke(id: string) {
    let found = false;
    await this.update((d) => {
      const k = d.keys.find((x) => x.id === id && !x.revokedAt);
      if (k) { k.revokedAt = new Date().toISOString(); found = true; }
    });
    return found;
  }
  async recordUsage(keyId: string, endpoint: string, ok: boolean, bytesIn: number) {
    await this.update((d) => {
      const date = today();
      let u = d.usage.find((x) => x.keyId === keyId && x.date === date);
      if (!u) d.usage.push((u = { keyId, date, requests: 0, errors: 0, bytesIn: 0, endpoints: {} }));
      u.requests++;
      if (!ok) u.errors++;
      u.bytesIn += bytesIn;
      u.endpoints[endpoint] = (u.endpoints[endpoint] ?? 0) + 1;
    });
  }
  async usage(keyId: string, days: number) {
    const want = new Set(daysBack(days));
    return (await this.read()).usage.filter((u) => u.keyId === keyId && want.has(u.date));
  }
}

// ───────── Firestore backend

class FirestoreStore implements KeyStore {
  private db = (async () => {
    const { getApps, initializeApp, applicationDefault } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: process.env.GCP_PROJECT });
    return getFirestore(app);
  })();
  /** Key lookups happen on every request; cache them briefly (revocation takes effect within a minute). */
  private cache = new Map<string, { key: ApiKey | null; at: number }>();

  async findByHash(hash: string) {
    const hit = this.cache.get(hash);
    if (hit && Date.now() - hit.at < 60_000) return hit.key;
    const snap = await (await this.db).collection("api_keys").doc(hash).get();
    const key = snap.exists ? (snap.data() as ApiKey) : null;
    this.cache.set(hash, { key, at: Date.now() });
    return key;
  }
  async list() {
    const snap = await (await this.db).collection("api_keys").orderBy("createdAt").get();
    return snap.docs.map((d) => d.data() as ApiKey);
  }
  async create(key: ApiKey) {
    await (await this.db).collection("api_keys").doc(key.hash).create(key);
  }
  async revoke(id: string) {
    const db = await this.db;
    const snap = await db.collection("api_keys").where("id", "==", id).limit(1).get();
    if (snap.empty || snap.docs[0].get("revokedAt")) return false;
    await snap.docs[0].ref.update({ revokedAt: new Date().toISOString() });
    return true;
  }
  async recordUsage(keyId: string, endpoint: string, ok: boolean, bytesIn: number) {
    const { FieldValue } = await import("firebase-admin/firestore");
    const date = today();
    await (await this.db).collection("api_usage").doc(`${keyId}_${date}`).set({
      keyId, date,
      requests: FieldValue.increment(1),
      errors: FieldValue.increment(ok ? 0 : 1),
      bytesIn: FieldValue.increment(bytesIn),
      endpoints: { [endpoint]: FieldValue.increment(1) },
    }, { merge: true });
  }
  async usage(keyId: string, days: number) {
    const db = await this.db;
    const refs = daysBack(days).map((d) => db.collection("api_usage").doc(`${keyId}_${d}`));
    const snaps = await db.getAll(...refs);
    return snaps.filter((s) => s.exists).map((s) => s.data() as UsageDay);
  }
}

let store: KeyStore | null = null;
export function keyStore(): KeyStore {
  store ??= process.env.API_KEYS_BACKEND === "firestore" ? new FirestoreStore() : new FileStore(process.env.API_DATA_DIR || ".data");
  return store;
}
