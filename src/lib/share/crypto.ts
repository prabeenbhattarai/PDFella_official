/**
 * End-to-end encryption for share links, using the browser's Web Crypto. The
 * file and its name are encrypted before upload, and the secret travels only in
 * the link's #fragment, which browsers never send to a server. With a password,
 * the key needs both the secret and the password.
 */
const IV_BYTES = 12;
export const PBKDF2_ITERATIONS = 600_000;
/** AES-GCM adds the IV and a 16-byte tag to each encrypted message. */
export const encryptedSize = (plain: number) => plain + IV_BYTES + 16;

export const toBase64Url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function deriveKey(secret: Uint8Array, salt: Uint8Array | null, password: string | undefined, iterations: number): Promise<CryptoKey> {
  if (!salt) return crypto.subtle.importKey("raw", secret as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
  const pw = new TextEncoder().encode(password ?? "");
  const material = new Uint8Array(secret.length + pw.length);
  material.set(secret);
  material.set(pw, secret.length);
  const base = await crypto.subtle.importKey("raw", material as BufferSource, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function seal(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = random(IV_BYTES);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return out;
}

async function open(key: CryptoKey, sealed: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.subarray(0, IV_BYTES) as BufferSource }, key, sealed.subarray(IV_BYTES) as BufferSource));
}

export interface SealedFile { data: Uint8Array; nameCt: string; salt: string | null; iterations: number | null; secret: string }

export async function sealFile(bytes: Uint8Array, name: string, password?: string): Promise<SealedFile> {
  const secret = random(32);
  const salt = password ? random(16) : null;
  const key = await deriveKey(secret, salt, password, PBKDF2_ITERATIONS);
  return {
    data: await seal(key, bytes),
    nameCt: toBase64Url(await seal(key, new TextEncoder().encode(name))),
    salt: salt && toBase64Url(salt),
    iterations: salt && PBKDF2_ITERATIONS,
    secret: toBase64Url(secret),
  };
}

export interface LinkKeyInput { secret: string; salt: string | null; iterations: number | null; password?: string }

export const linkKey = ({ secret, salt, iterations, password }: LinkKeyInput) =>
  deriveKey(fromBase64Url(secret), salt ? fromBase64Url(salt) : null, password, iterations ?? PBKDF2_ITERATIONS);

/** Throws if the key is wrong, so this also checks the password before any download. */
export const openName = async (key: CryptoKey, nameCt: string) => new TextDecoder().decode(await open(key, fromBase64Url(nameCt)));
export const openFile = open;
