import "server-only";
import { SignJWT } from "jose";
import { bearer, PROJECT_ID, serviceAccountKey, TokenError, verifyIdToken } from "./firebase-auth";

/**
 * Admin panel back end. Access is decided here, on the server: the request must
 * carry a valid Firebase ID token for a verified Google account on the allowlist.
 *
 * This deliberately avoids firebase-admin: its token verifier loads an ES module
 * via require(), which fails on the Node versions Vercel runs (ERR_REQUIRE_ESM).
 * Tokens are verified as Firebase documents it, and users are read from the
 * Identity Toolkit REST API with the service account.
 */
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "prabeenbhattarai7450@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export const canListUsers = () => !!process.env.FIREBASE_SERVICE_ACCOUNT;

export class AdminAuthError extends Error {
  constructor(readonly status: 401 | 403, message: string) { super(message); }
}

/** Returns the admin's email, or throws AdminAuthError. */
export async function requireAdmin(req: Request): Promise<string> {
  if (!PROJECT_ID) throw new AdminAuthError(403, "Sign-in isn't configured.");
  const token = bearer(req);
  if (!token) throw new AdminAuthError(401, "Sign in first.");
  let claims;
  try {
    claims = await verifyIdToken(token);
  } catch (e) {
    const code = e instanceof TokenError ? e.code : String(e);
    console.error("admin token check failed:", code);
    throw new AdminAuthError(401, code === "ERR_JWT_EXPIRED" ? "Your session has expired. Sign in again." : `Sign-in couldn't be verified (${code}). Sign in again.`);
  }
  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : null;
  if (!email || claims.email_verified !== true || !ADMIN_EMAILS.includes(email)) {
    throw new AdminAuthError(403, "This account isn't allowed to use the admin panel.");
  }
  return email;
}

// ───────── registered users (Identity Toolkit REST + service account)

let accessToken: { value: string; expires: number } | null = null;

/** OAuth access token for the service account (JWT bearer grant), cached until shortly before it expires. */
async function googleAccessToken(): Promise<string> {
  if (accessToken && accessToken.expires > Date.now() + 60_000) return accessToken.value;
  const { sa, key } = await serviceAccountKey();
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email).setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now).setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google rejected the service account (${body.error_description ?? body.error ?? res.status}). If you deleted this key, generate a new one.`);
  accessToken = { value: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return accessToken.value;
}

interface RestUser { localId: string; email?: string; displayName?: string; photoUrl?: string; createdAt?: string; lastLoginAt?: string; lastRefreshAt?: string }

async function listUsers(): Promise<RestUser[]> {
  const token = await googleAccessToken();
  const users: RestUser[] = [];
  let next = "";
  do {
    const url = new URL(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`);
    url.searchParams.set("maxResults", "1000");
    if (next) url.searchParams.set("nextPageToken", next);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error?.message ?? `Listing users failed (${res.status})`);
    users.push(...(body.users ?? []));
    next = body.nextPageToken ?? "";
  } while (next && users.length < 100_000);
  return users;
}

const DAY = 864e5;

export interface UserStats {
  total: number;
  new: { d1: number; d7: number; d30: number };
  active: { d1: number; d7: number; d30: number };
  /** Sign-ups per day for the last 30 days, oldest first. */
  daily: { date: string; signups: number }[];
  recent: { email: string | null; name: string | null; photo: string | null; createdAt: string; lastSignInAt: string | null }[];
}

export async function userStats(): Promise<UserStats> {
  const users = await listUsers();
  const now = Date.now();
  const created = (u: RestUser) => Number(u.createdAt ?? 0);
  const lastLogin = (u: RestUser) => (u.lastLoginAt ? Number(u.lastLoginAt) : null);
  const lastSeen = (u: RestUser) => Math.max(created(u), lastLogin(u) ?? 0, u.lastRefreshAt ? Date.parse(u.lastRefreshAt) : 0);
  const within = (t: number, days: number) => now - t < days * DAY;
  const count = (f: (u: RestUser) => boolean) => users.filter(f).length;

  const daily = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(now - (29 - i) * DAY).toISOString().slice(0, 10);
    return { date, signups: count((u) => new Date(created(u)).toISOString().slice(0, 10) === date) };
  });

  return {
    total: users.length,
    new: { d1: count((u) => within(created(u), 1)), d7: count((u) => within(created(u), 7)), d30: count((u) => within(created(u), 30)) },
    active: { d1: count((u) => within(lastSeen(u), 1)), d7: count((u) => within(lastSeen(u), 7)), d30: count((u) => within(lastSeen(u), 30)) },
    daily,
    recent: [...users].sort((a, b) => created(b) - created(a)).slice(0, 25).map((u) => ({
      email: u.email ?? null, name: u.displayName ?? null, photo: u.photoUrl ?? null,
      createdAt: new Date(created(u)).toISOString(), lastSignInAt: lastLogin(u) ? new Date(lastLogin(u)!).toISOString() : null,
    })),
  };
}

// ───────── visitors (PostHog)

const PH_HOST = process.env.POSTHOG_APP_HOST || "https://eu.posthog.com";
const PH_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PH_PROJECT = process.env.POSTHOG_PROJECT_ID;

export const canQueryVisitors = () => !!(PH_KEY && PH_PROJECT);

export interface VisitorWindow { visitors: number; signedIn: number; guests: number; pageviews: number }
export type VisitorStats = Record<"d1" | "d7" | "d30", VisitorWindow>;

/**
 * Unique visitors from PostHog, split by the `signed_in` property the site sets
 * on every event. Events from before sign-in existed count as guests. In
 * cookieless mode a visitor gets a new anonymous ID each day, so multi-day
 * windows count someone who came on 3 days as 3 visitors.
 */
export async function visitorStats(): Promise<VisitorStats> {
  const window = async (days: number): Promise<VisitorWindow> => {
    const res = await fetch(`${PH_HOST}/api/projects/${PH_PROJECT}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${PH_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query: `SELECT if(properties.signed_in = true, 'in', 'out') AS who, count(DISTINCT distinct_id) AS visitors, count() AS pageviews
                  FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${days} DAY GROUP BY who`,
        },
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.json().then((b) => b.detail ?? b.message ?? "", () => "");
      throw new Error(res.status === 403
        ? `PostHog refused the key (403${detail ? `: ${detail}` : ""}). Give the personal API key the "Query: Read" scope and access to project ${PH_PROJECT}.`
        : `PostHog query failed (${res.status}${detail ? `: ${detail}` : ""})`);
    }
    const rows = ((await res.json()).results ?? []) as [string, number, number][];
    const signedIn = rows.find((r) => r[0] === "in")?.[1] ?? 0;
    const guests = rows.find((r) => r[0] === "out")?.[1] ?? 0;
    return { visitors: signedIn + guests, signedIn, guests, pageviews: rows.reduce((n, r) => n + r[2], 0) };
  };
  const [d1, d7, d30] = await Promise.all([window(1), window(7), window(30)]);
  return { d1, d7, d30 };
}
