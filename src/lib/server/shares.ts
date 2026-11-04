import "server-only";
import { randomBytes } from "node:crypto";
import { getShareObjects } from "./storage";
import { shareConfig } from "./config";

/**
 * Share links. Files are encrypted in the sender's browser, so a record holds no
 * readable file name or contents, and the server can't open what it stores.
 */
/** 5 MB, plus what encrypting the file adds. */
export const SHARE_MAX_BYTES = 5 * 1024 * 1024 + 64;
export const SHARE_DAYS = [1, 7, 30] as const;
export const SHARE_MAX_ACTIVE = 20;

export interface ShareReport { reason: string; details: string; at: number }
export interface ShareRecord {
  id: string;
  ownerId: string;
  ownerEmail: string | null;
  status: "uploading" | "ready";
  size: number;
  nameCt: string;
  salt: string | null;
  iterations: number | null;
  createdAt: number;
  expiresAt: number;
  reports: ShareReport[];
}

// Lower case only: middleware redirects mixed-case paths to lower case.
export const newShareId = () => randomBytes(16).toString("hex");
export const validShareId = (id: string) => /^[0-9a-f]{32}$/.test(id);
export const shareObjectKey = (id: string) => `shares/${id}/data`;

export interface ShareStore {
  create(r: ShareRecord): Promise<void>;
  get(id: string): Promise<ShareRecord | null>;
  update(id: string, patch: Partial<ShareRecord>): Promise<void>;
  delete(id: string): Promise<void>;
  listByOwner(ownerId: string): Promise<ShareRecord[]>;
  listRecent(limit: number): Promise<ShareRecord[]>;
  listExpired(now: number, limit: number): Promise<ShareRecord[]>;
}

class MemoryShareStore implements ShareStore {
  // Survives Next.js dev hot reloads.
  private get map(): Map<string, ShareRecord> {
    const g = globalThis as unknown as { __pdfellaShares?: Map<string, ShareRecord> };
    return (g.__pdfellaShares ??= new Map());
  }
  async create(r: ShareRecord) { this.map.set(r.id, r); }
  async get(id: string) { return this.map.get(id) ?? null; }
  async update(id: string, patch: Partial<ShareRecord>) {
    const r = this.map.get(id);
    if (r) this.map.set(id, { ...r, ...patch });
  }
  async delete(id: string) { this.map.delete(id); }
  async listByOwner(ownerId: string) { return [...this.map.values()].filter((r) => r.ownerId === ownerId); }
  async listRecent(limit: number) { return [...this.map.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit); }
  async listExpired(now: number, limit: number) { return [...this.map.values()].filter((r) => r.expiresAt < now).slice(0, limit); }
}

class FirestoreShareStore implements ShareStore {
  private async col() {
    const { getFirestore } = await import("firebase-admin/firestore");
    const { adminApp } = await import("./firebase");
    return getFirestore(adminApp()).collection("shares");
  }
  async create(r: ShareRecord) { await (await this.col()).doc(r.id).create(r); }
  async get(id: string) {
    const snap = await (await this.col()).doc(id).get();
    return snap.exists ? (snap.data() as ShareRecord) : null;
  }
  async update(id: string, patch: Partial<ShareRecord>) { await (await this.col()).doc(id).update(patch); }
  async delete(id: string) { await (await this.col()).doc(id).delete(); }
  async listByOwner(ownerId: string) {
    return (await (await this.col()).where("ownerId", "==", ownerId).get()).docs.map((d) => d.data() as ShareRecord);
  }
  async listRecent(limit: number) {
    return (await (await this.col()).orderBy("createdAt", "desc").limit(limit).get()).docs.map((d) => d.data() as ShareRecord);
  }
  async listExpired(now: number, limit: number) {
    return (await (await this.col()).where("expiresAt", "<", now).limit(limit).get()).docs.map((d) => d.data() as ShareRecord);
  }
}

let store: ShareStore | null = null;
export function getShares(): ShareStore {
  store ??= shareConfig().backend === "firebase" ? new FirestoreShareStore() : new MemoryShareStore();
  return store;
}

/** A link stops working the moment it expires, even before the daily cleanup deletes it. */
export const isLive = (r: ShareRecord | null, now = Date.now()): r is ShareRecord => !!r && r.status === "ready" && r.expiresAt > now;

export async function deleteShare(id: string) {
  await getShareObjects().deletePrefix(`shares/${id}/`);
  await getShares().delete(id);
}

export async function sweepExpiredShares(limit = 500): Promise<number> {
  if (shareConfig().backend === "off") return 0;
  let deleted = 0;
  for (const r of await getShares().listExpired(Date.now(), limit)) {
    try {
      await deleteShare(r.id);
      deleted++;
    } catch (e) {
      console.error("[cleanup] failed for share", r.id, (e as Error).message);
    }
  }
  return deleted;
}
