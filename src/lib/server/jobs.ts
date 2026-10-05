import "server-only";
import { config } from "./config";
import type { ServerOp } from "../tools";

export type JobStatus = "UPLOADING" | "PROCESSING" | "READY" | "ERROR" | "EXPIRED";

/** Job record. Deliberately contains no file names, contents or user parameters. */
export interface Job {
  id: string;
  op: ServerOp;
  status: JobStatus;
  inputs: { key: string; size: number; contentType: string; ext: string }[];
  output?: { key: string; ext: string; size?: number };
  progress?: number;
  error?: { code: string; message: string };
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  /** Reserved for the future account system. */
  ownerId?: string | null;
}

export interface JobStore {
  create(job: Job): Promise<void>;
  get(id: string): Promise<Job | null>;
  update(id: string, patch: Partial<Job>): Promise<void>;
  delete(id: string): Promise<void>;
  listExpired(now: number, limit: number): Promise<Job[]>;
}

class MemoryJobStore implements JobStore {
  // Survives Next.js dev hot reloads.
  private get map(): Map<string, Job> {
    const g = globalThis as unknown as { __pdfellaJobs?: Map<string, Job> };
    return (g.__pdfellaJobs ??= new Map());
  }
  async create(job: Job) { this.map.set(job.id, job); }
  async get(id: string) { return this.map.get(id) ?? null; }
  async update(id: string, patch: Partial<Job>) {
    const j = this.map.get(id);
    if (j) this.map.set(id, { ...j, ...patch, updatedAt: Date.now() });
  }
  async delete(id: string) { this.map.delete(id); }
  async listExpired(now: number, limit: number) { return [...this.map.values()].filter((j) => j.expiresAt < now).slice(0, limit); }
}

class FirestoreJobStore implements JobStore {
  private async col() {
    const { getFirestore } = await import("firebase-admin/firestore");
    const { adminApp } = await import("./firebase");
    return getFirestore(adminApp()).collection("jobs");
  }
  async create(job: Job) {
    const { Timestamp } = await import("firebase-admin/firestore");
    // expiresAtTs drives the Firestore TTL policy (automatic deletion of the record).
    await (await this.col()).doc(job.id).create({ ...job, expiresAtTs: Timestamp.fromMillis(job.expiresAt + 24 * 3600_000) });
  }
  async get(id: string) {
    const snap = await (await this.col()).doc(id).get();
    if (!snap.exists) return null;
    const { expiresAtTs: _ttl, ...job } = snap.data() as Job & { expiresAtTs?: unknown };
    void _ttl;
    return job as Job;
  }
  async update(id: string, patch: Partial<Job>) {
    await (await this.col()).doc(id).update({ ...patch, updatedAt: Date.now() });
  }
  async delete(id: string) { await (await this.col()).doc(id).delete(); }
  async listExpired(now: number, limit: number) {
    const q = await (await this.col()).where("expiresAt", "<", now).limit(limit).get();
    return q.docs.map((d) => d.data() as Job);
  }
}

let jobs: JobStore | null = null;
export function getJobs(): JobStore {
  jobs ??= config.jobs === "firestore" ? new FirestoreJobStore() : new MemoryJobStore();
  return jobs;
}
