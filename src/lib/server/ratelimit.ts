import "server-only";
import { config } from "./config";

/** Fixed-window counter per hashed client per day (and a short burst window). */
export interface RateLimiter { hit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; remaining: number }> }

class MemoryLimiter implements RateLimiter {
  private get map() {
    const g = globalThis as unknown as { __pdfellaRl?: Map<string, { n: number; reset: number }> };
    return (g.__pdfellaRl ??= new Map());
  }
  async hit(key: string, limit: number, windowSec: number) {
    const now = Date.now();
    const e = this.map.get(key);
    if (!e || e.reset < now) { this.map.set(key, { n: 1, reset: now + windowSec * 1000 }); return { ok: true, remaining: limit - 1 }; }
    e.n++;
    return { ok: e.n <= limit, remaining: Math.max(0, limit - e.n) };
  }
}

class FirestoreLimiter implements RateLimiter {
  async hit(key: string, limit: number, windowSec: number) {
    const { getFirestore, FieldValue, Timestamp } = await import("firebase-admin/firestore");
    const { adminApp } = await import("./firebase");
    const window = Math.floor(Date.now() / (windowSec * 1000));
    const ref = getFirestore(adminApp()).collection("usage").doc(`${key}_${windowSec}_${window}`);
    const n = await getFirestore(adminApp()).runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = (snap.exists ? (snap.data()!.count as number) : 0) + 1;
      tx.set(ref, { count: FieldValue.increment(1), expiresAtTs: Timestamp.fromMillis((window + 2) * windowSec * 1000) }, { merge: true });
      return count;
    });
    return { ok: n <= limit, remaining: Math.max(0, limit - n) };
  }
}

let limiter: RateLimiter | null = null;
export function getLimiter(): RateLimiter {
  limiter ??= config.jobs === "firestore" ? new FirestoreLimiter() : new MemoryLimiter();
  return limiter;
}
