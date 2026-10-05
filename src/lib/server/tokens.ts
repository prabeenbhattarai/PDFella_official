import "server-only";
import { createHmac, timingSafeEqual, randomBytes, createHash } from "node:crypto";
import { requireSecret } from "./config";

/** Unguessable job id (128 bits, URL-safe). */
export function newJobId(): string {
  return randomBytes(16).toString("base64url");
}

export function hmac(purpose: string, value: string): string {
  return createHmac("sha256", requireSecret()).update(`${purpose}:${value}`).digest("base64url");
}

export function verify(purpose: string, value: string, sig: string | null | undefined): boolean {
  if (!sig) return false;
  const expected = Buffer.from(hmac(purpose, value));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Capability token that authorises the anonymous creator of a job. */
export const jobToken = (jobId: string) => hmac("job", jobId);
export const checkJobToken = (jobId: string, header: string | null) => verify("job", jobId, header?.replace(/^Bearer\s+/i, ""));

/** Token the worker presents when reporting status for a job. */
export const callbackToken = (jobId: string) => hmac("callback", jobId);

/** Signed, expiring URL parameters for the local storage backend. */
export function signBlob(key: string, method: "GET" | "PUT", expires: number, maxBytes = 0) {
  return hmac("blob", `${method}:${key}:${expires}:${maxBytes}`);
}

/** One-way hash so rate limits never store raw IP addresses. */
export function hashClient(ip: string): string {
  return createHash("sha256").update(`${requireSecret()}:${ip}`).digest("hex").slice(0, 32);
}
