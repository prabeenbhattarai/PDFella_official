import "server-only";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTPayload } from "jose";

/**
 * Firebase Authentication on the server without firebase-admin (its token
 * verifier require()s an ES module, which fails on Vercel's Node with
 * ERR_REQUIRE_ESM). ID tokens are verified as Firebase documents it; custom
 * tokens are signed with the service account (FIREBASE_SERVICE_ACCOUNT).
 */
export const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

// Google's public keys for Firebase ID tokens (cached and rotated by jose).
const FIREBASE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

export class TokenError extends Error {
  constructor(readonly code: string) { super(code); }
}

/** Verifies a Firebase ID token from `Authorization: Bearer …`; throws TokenError. */
export async function verifyIdToken(token: string): Promise<JWTPayload & { email?: string; email_verified?: boolean; name?: string }> {
  if (!PROJECT_ID) throw new TokenError("not_configured");
  try {
    const { payload } = await jwtVerify(token, FIREBASE_KEYS, {
      algorithms: ["RS256"],
      audience: PROJECT_ID,
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      clockTolerance: 30,
    });
    if (!payload.sub) throw new TokenError("no_subject");
    return payload;
  } catch (e) {
    if (e instanceof TokenError) throw e;
    throw new TokenError((e as { code?: string }).code ?? (e as Error).message);
  }
}

export const bearer = (req: Request) => req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;

// ───────── service account

interface ServiceAccount { project_id?: string; client_email: string; private_key: string }

/**
 * Accepts the key file however it was pasted: raw JSON, base64 of it, wrapped in
 * quotes or a code fence, or with the private key's "\n" escapes turned into real
 * line breaks (which some dashboards do and which makes the JSON invalid).
 */
function parseServiceAccount(raw: string): ServiceAccount | null {
  let text = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  if (text.startsWith('"')) {
    // The whole file pasted as one JSON string.
    try { const inner = JSON.parse(text); if (typeof inner === "string") text = inner.trim(); } catch { text = text.slice(1, -1); }
  } else if (text.startsWith("'") && text.endsWith("'")) text = text.slice(1, -1);
  if (!text.startsWith("{")) {
    try { text = Buffer.from(text, "base64").toString("utf8").trim(); } catch { return null; }
  }
  const attempts = [
    text,
    // Real line breaks inside the private key string → JSON escapes.
    text.replace(/("private_key"\s*:\s*")([\s\S]*?)(")/, (_, a: string, key: string, b: string) => a + key.replace(/\r?\n/g, "\\n") + b),
  ];
  for (const t of attempts) {
    try {
      const v = JSON.parse(t);
      // Pasted as a JSON string of JSON.
      return typeof v === "string" ? JSON.parse(v) : v;
    } catch { /* next attempt */ }
  }
  return null;
}

export function serviceAccount(): ServiceAccount {
  const parsed = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT ?? "");
  if (!parsed) throw new Error("FIREBASE_SERVICE_ACCOUNT isn't valid JSON. Paste it as base64 instead (see the setup notes).");
  if (!parsed.client_email || !parsed.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT is missing client_email or private_key.");
  if (parsed.project_id && PROJECT_ID && parsed.project_id !== PROJECT_ID) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT is for project "${parsed.project_id}", but sign-in uses "${PROJECT_ID}".`);
  }
  return parsed;
}

export async function serviceAccountKey() {
  const sa = serviceAccount();
  try {
    return { sa, key: await importPKCS8(sa.private_key, "RS256") };
  } catch {
    throw new Error("The private key in FIREBASE_SERVICE_ACCOUNT can't be read. Paste the whole key file again.");
  }
}

/**
 * A Firebase custom token for `uid` (valid 1 hour): the client exchanges it with
 * signInWithCustomToken. Used to hand a browser sign-in over to the desktop app.
 */
export async function createCustomToken(uid: string): Promise<string> {
  const { sa, key } = await serviceAccountKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email).setSubject(sa.client_email)
    .setAudience("https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit")
    .setIssuedAt(now).setExpirationTime(now + 3600)
    .sign(key);
}
