/**
 * Sign-in for the desktop app (desktop/), which shows the site in a web view
 * whose user agent contains "PDFellaDesktop". Google refuses OAuth inside web
 * views, so:
 *
 *  1. In the app, startDesktopSignIn() makes a one-time AES key and state,
 *     keeps them in localStorage and navigates to /desktop-auth#k=…&s=…. The app
 *     opens that URL in the system browser instead.
 *  2. In the browser, /desktop-auth signs in with Google, swaps the ID token for a
 *     Firebase custom token (/api/auth/desktop-token), encrypts it with the key
 *     and opens pdfella://auth#s=…&iv=…&c=….
 *  3. The app turns that deep link into /desktop-auth/complete#…, which decrypts
 *     the token with the stored key and calls signInWithCustomToken.
 *
 * The key only ever travels in URL fragments (never sent to a server), so an app
 * that intercepts the pdfella:// link gets ciphertext it can't use.
 */

const STORE = "pdfella:desktop-auth";
const MAX_AGE = 15 * 60_000;

export const isDesktopApp = () => typeof navigator !== "undefined" && navigator.userAgent.includes("PDFellaDesktop");

const b64u = {
  encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  decode: (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
};

const aesKey = (raw: Uint8Array) => crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);

/** Step 1 (in the app). */
export function startDesktopSignIn(returnTo = location.pathname + location.search) {
  const k = b64u.encode(crypto.getRandomValues(new Uint8Array(32)));
  const s = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
  localStorage.setItem(STORE, JSON.stringify({ k, s, returnTo, at: Date.now() }));
  location.href = `/desktop-auth#k=${k}&s=${s}`;
}

/** Step 2 (in the browser): encrypt the custom token for the app. */
export async function sealForApp(k: string, s: string, customToken: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(b64u.decode(k)), new TextEncoder().encode(customToken)));
  return `pdfella://auth#s=${s}&iv=${b64u.encode(iv)}&c=${b64u.encode(c)}`;
}

/** Step 3 (in the app): returns the custom token and where to go next, or throws. */
export async function openFromBrowser(hash: string): Promise<{ customToken: string; returnTo: string }> {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as { k: string; s: string; returnTo: string; at: number } | null;
  if (!saved) throw new Error("This sign-in wasn't started in this app. Click Sign in again.");
  if (Date.now() - saved.at > MAX_AGE) throw new Error("This sign-in link has expired. Click Sign in again.");
  if (p.get("s") !== saved.s) throw new Error("This sign-in link doesn't match. Click Sign in again.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64u.decode(p.get("iv") ?? "") as BufferSource }, await aesKey(b64u.decode(saved.k)), b64u.decode(p.get("c") ?? "") as BufferSource);
  localStorage.removeItem(STORE);
  return { customToken: new TextDecoder().decode(plain), returnTo: saved.returnTo.startsWith("/") ? saved.returnTo : "/" };
}
