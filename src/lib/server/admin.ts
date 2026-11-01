import "server-only";
import type { App } from "firebase-admin/app";
import type { UserRecord } from "firebase-admin/auth";

/**
 * Admin panel back end. Access is decided here, on the server: the request must
 * carry a valid Firebase ID token for a verified Google account on the allowlist.
 */
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "prabeenbhattarai7450@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

/**
 * Firebase Admin for the sign-in project. Verifying ID tokens needs only the
 * project ID; listing users needs a service account
 * (FIREBASE_SERVICE_ACCOUNT: the key file's JSON, raw or base64).
 */
/** Loaded on first use so a failure surfaces as a handled error, not a crashed route. */
async function adminAuth() {
  const [app, { getAuth }] = await Promise.all([import("firebase-admin/app"), import("firebase-admin/auth")]);
  return getAuth(authApp(app));
}

function authApp({ cert, getApps, initializeApp }: typeof import("firebase-admin/app")): App {
  const existing = getApps().find((a) => a.name === "auth-admin");
  if (existing) return existing;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  let credential;
  if (raw) {
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    credential = cert(JSON.parse(json));
  }
  return initializeApp({ projectId: PROJECT_ID, ...(credential ? { credential } : {}) }, "auth-admin");
}

export const canListUsers = () => !!process.env.FIREBASE_SERVICE_ACCOUNT;

export class AdminAuthError extends Error {
  constructor(readonly status: 401 | 403, message: string) { super(message); }
}

/** Returns the admin's email, or throws AdminAuthError. */
export async function requireAdmin(req: Request): Promise<string> {
  if (!PROJECT_ID) throw new AdminAuthError(403, "Sign-in isn't configured.");
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new AdminAuthError(401, "Sign in first.");
  let claims;
  try {
    // Checking revocation looks the user up, which needs the service account.
    claims = await (await adminAuth()).verifyIdToken(token, canListUsers());
  } catch {
    throw new AdminAuthError(401, "Your session has expired. Sign in again.");
  }
  const email = claims.email?.toLowerCase();
  if (!email || !claims.email_verified || !ADMIN_EMAILS.includes(email)) {
    throw new AdminAuthError(403, "This account isn't allowed to use the admin panel.");
  }
  return email;
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
  const auth = await adminAuth();
  const users: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken && users.length < 100_000);

  const now = Date.now();
  const created = (u: UserRecord) => Date.parse(u.metadata.creationTime);
  const lastSeen = (u: UserRecord) => Date.parse(u.metadata.lastRefreshTime ?? u.metadata.lastSignInTime ?? u.metadata.creationTime);
  const within = (t: number, days: number) => now - t < days * DAY;
  const count = (f: (u: UserRecord) => boolean) => users.filter(f).length;

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
      email: u.email ?? null, name: u.displayName ?? null, photo: u.photoURL ?? null,
      createdAt: new Date(created(u)).toISOString(), lastSignInAt: u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : null,
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
    if (!res.ok) throw new Error(`PostHog query failed (${res.status})`);
    const rows = ((await res.json()).results ?? []) as [string, number, number][];
    const signedIn = rows.find((r) => r[0] === "in")?.[1] ?? 0;
    const guests = rows.find((r) => r[0] === "out")?.[1] ?? 0;
    return { visitors: signedIn + guests, signedIn, guests, pageviews: rows.reduce((n, r) => n + r[2], 0) };
  };
  const [d1, d7, d30] = await Promise.all([window(1), window(7), window(30)]);
  return { d1, d7, d30 };
}
