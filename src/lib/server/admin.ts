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

interface RestUser { localId: string; email?: string; displayName?: string; photoUrl?: string; createdAt?: string; lastLoginAt?: string; lastRefreshAt?: string; customAttributes?: string }

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
  };
}

export interface UserRow { email: string | null; name: string | null; photo: string | null; createdAt: string; lastSignInAt: string | null; desktopLastUsed: string | null; country: string | null }
export interface UserPage { total: number; page: number; pages: number; size: number; rows: UserRow[] }

/** One page of every registered account, newest first, optionally filtered by name or email. */
export async function userPage({ page = 1, size = 20, q = "" }: { page?: number; size?: number; q?: string }): Promise<UserPage> {
  const needle = q.trim().toLowerCase();
  const created = (u: RestUser) => Number(u.createdAt ?? 0);
  const all = (await listUsers())
    .filter((u) => !needle || `${u.email ?? ""} ${u.displayName ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => created(b) - created(a));
  const pages = Math.max(1, Math.ceil(all.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return {
    total: all.length, page: current, pages, size,
    rows: all.slice((current - 1) * size, current * size).map((u) => ({
      email: u.email ?? null, name: u.displayName ?? null, photo: u.photoUrl ?? null,
      createdAt: new Date(created(u)).toISOString(),
      lastSignInAt: u.lastLoginAt ? new Date(Number(u.lastLoginAt)).toISOString() : null,
      desktopLastUsed: (attributes(u).desktop as DesktopMark | undefined)?.last ?? null,
      country: typeof attributes(u).country === "string" ? (attributes(u).country as string) : null,
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

/** Runs a HogQL query against the PostHog project and returns its rows. */
async function hogql<Row extends unknown[]>(query: string): Promise<Row[]> {
  const res = await fetch(`${PH_HOST}/api/projects/${PH_PROJECT}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PH_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail ?? b.message ?? "", () => "");
    throw new Error(res.status === 403
      ? `PostHog refused the key (403${detail ? `: ${detail}` : ""}). Give the personal API key the "Query: Read" scope and access to project ${PH_PROJECT}.`
      : `PostHog query failed (${res.status}${detail ? `: ${detail}` : ""})`);
  }
  return ((await res.json()).results ?? []) as Row[];
}

/**
 * Unique visitors from PostHog, split by the `signed_in` property the site sets
 * on every event. Events from before sign-in existed count as guests. In
 * cookieless mode a visitor gets a new anonymous ID each day, so multi-day
 * windows count someone who came on 3 days as 3 visitors.
 */
export async function visitorStats(): Promise<VisitorStats> {
  const window = async (days: number): Promise<VisitorWindow> => {
    // One row, each person counted once: someone who signed in partway through a visit has
    // events on both sides, so summing per-group counts would count them twice.
    const [[visitors, signedIn, pageviews] = [0, 0, 0]] = await hogql<[number, number, number]>(
      `SELECT count(DISTINCT distinct_id), count(DISTINCT if(properties.signed_in = true, distinct_id, NULL)), count()
       FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${days} DAY`,
    );
    return { visitors, signedIn, guests: visitors - signedIn, pageviews };
  };
  const [d1, d7, d30] = await Promise.all([window(1), window(7), window(30)]);
  return { d1, d7, d30 };
}

export interface Count { key: string; visitors: number; views: number }
export interface Insights {
  days: number;
  /** ISO alpha-2 country → visitors / signed-in visitors (PostHog GeoIP; no IPs stored). */
  countries: { code: string; visitors: number; signedIn: number }[];
  sources: Count[];
  pages: Count[];
  devices: Count[];
  browsers: Count[];
  systems: Count[];
  /** Visitors per day over the last 30 days, oldest first. */
  daily: { date: string; visitors: number; views: number }[];
}

const insightsCache = new Map<number, { at: number; value: Insights }>();

/** Where visitors come from and what they use, for the last `days` days. Cached for 5 minutes. */
export async function insights(days: 1 | 7 | 30): Promise<Insights> {
  const hit = insightsCache.get(days);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  const where = `event = '$pageview' AND timestamp > now() - INTERVAL ${days} DAY`;
  const top = (expr: string, limit = 10, extra = "") => hogql<[string | null, number, number]>(
    `SELECT ${expr} AS k, count(DISTINCT distinct_id) AS visitors, count() AS views FROM events
     WHERE ${where} ${extra} GROUP BY k ORDER BY visitors DESC LIMIT ${limit}`,
  ).then((rows) => rows.filter((r) => r[0]).map(([key, visitors, views]) => ({ key: String(key), visitors, views })));

  const [countries, sources, pages, devices, browsers, systems, daily] = await Promise.all([
    hogql<[string | null, number, number]>(
      `SELECT properties.$geoip_country_code AS cc, count(DISTINCT distinct_id) AS visitors,
              count(DISTINCT if(properties.signed_in = true, distinct_id, NULL)) AS signed
       FROM events WHERE ${where} GROUP BY cc ORDER BY visitors DESC LIMIT 250`,
    ).then((rows) => rows.filter((r) => r[0]).map(([code, visitors, signedIn]) => ({ code: String(code).toUpperCase(), visitors, signedIn }))),
    // The site that sent the visit; pdfella.com itself means a full reload, so it's left out.
    top(`if(properties.$referring_domain IN ('', '$direct') OR properties.$referring_domain IS NULL, 'Direct', if(startsWith(properties.$referring_domain, 'www.'), substring(properties.$referring_domain, 5), properties.$referring_domain))`, 10,
      `AND (properties.$referring_domain IS NULL OR properties.$referring_domain NOT LIKE '%pdfella.com')`),
    top("properties.$pathname", 12),
    top("properties.$device_type", 5),
    top("properties.$browser", 8),
    top("properties.$os", 8),
    hogql<[string, number, number]>(
      `SELECT toString(toDate(timestamp)) AS d, count(DISTINCT distinct_id), count() FROM events
       WHERE event = '$pageview' AND timestamp > now() - INTERVAL 30 DAY GROUP BY d ORDER BY d`,
    ),
  ]);
  const byDate = new Map(daily.map(([d, v, n]) => [d, { visitors: v, views: n }]));
  const value: Insights = {
    days, countries, sources, pages, devices, browsers, systems,
    daily: Array.from({ length: 30 }, (_, i) => {
      const date = new Date(Date.now() - (29 - i) * DAY).toISOString().slice(0, 10);
      return { date, ...(byDate.get(date) ?? { visitors: 0, views: 0 }) };
    }),
  };
  insightsCache.set(days, { at: Date.now(), value });
  return value;
}

export interface DesktopWindow { users: number; mac: number; windows: number; pageviews: number }
export type DesktopUsage = Record<"d1" | "d7" | "d30", DesktopWindow>;

/**
 * Desktop app users: page views whose user agent carries "PDFellaDesktop" (set by
 * desktop/src-tauri/src/lib.rs), or tagged app=desktop by components/analytics/posthog.tsx.
 * Same cookieless caveat as visitorStats.
 */
export async function desktopUsage(): Promise<DesktopUsage> {
  const window = async (days: number): Promise<DesktopWindow> => {
    const rows = await hogql<[string, number, number]>(
      `SELECT multiIf(properties.$os = 'Windows', 'windows', properties.$os ILIKE '%mac%', 'mac', 'other') AS os,
              count(DISTINCT distinct_id) AS users, count() AS pageviews
       FROM events
       WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${days} DAY
         AND (properties.app = 'desktop' OR properties.$raw_user_agent LIKE '%PDFellaDesktop%')
       GROUP BY os`,
    );
    const get = (os: string) => rows.find((r) => r[0] === os)?.[1] ?? 0;
    return { users: rows.reduce((n, r) => n + r[1], 0), mac: get("mac"), windows: get("windows"), pageviews: rows.reduce((n, r) => n + r[2], 0) };
  };
  const [d1, d7, d30] = await Promise.all([window(1), window(7), window(30)]);
  return { d1, d7, d30 };
}

// ───────── desktop downloads (GitHub releases)

const RELEASES_REPO = "prabeenbhattarai/PDFella_official";

export interface DownloadStats {
  total: number;
  mac: number;
  windows: number;
  releases: { tag: string; publishedAt: string | null; mac: number; windows: number }[];
}

/**
 * Installer downloads, all time, from GitHub's per-file download counts (public,
 * no key needed; GITHUB_TOKEN only raises the rate limit). Updater archives
 * (.tar.gz) aren't installs, so they're left out.
 */
export async function downloadStats(): Promise<DownloadStats> {
  const res = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=100`, {
    headers: { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? "GitHub rate limit reached. Try again in a few minutes, or set GITHUB_TOKEN." : `GitHub returned ${res.status}`);
  const list = (await res.json()) as { tag_name: string; published_at: string | null; assets: { name: string; download_count: number }[] }[];
  const releases = list
    .filter((r) => r.tag_name.startsWith("desktop-v"))
    .map((r) => {
      const sum = (ext: string) => r.assets.filter((a) => a.name.endsWith(ext)).reduce((n, a) => n + a.download_count, 0);
      return { tag: r.tag_name.replace(/^desktop-/, ""), publishedAt: r.published_at, mac: sum(".dmg"), windows: sum(".exe") };
    });
  const mac = releases.reduce((n, r) => n + r.mac, 0);
  const windows = releases.reduce((n, r) => n + r.windows, 0);
  return { total: mac + windows, mac, windows, releases };
}

// ───────── who uses the desktop app

/** Kept on the Firebase account as the custom attribute `desktop` (see markDesktopUse). */
interface DesktopMark { first: string; last: string; os: string | null; v: string | null; opens: number }

const attributes = (u: RestUser): Record<string, unknown> => {
  try { return u.customAttributes ? JSON.parse(u.customAttributes) : {}; } catch { return {}; }
};

/** "mac" / "windows" and the app version from the desktop app's user agent. */
export function desktopAgent(ua: string): { os: string | null; version: string | null } | null {
  const v = ua.match(/PDFellaDesktop\/([\w.]+)/);
  if (!v) return null;
  return { os: /Windows/.test(ua) ? "windows" : /Macintosh|Mac OS/.test(ua) ? "mac" : null, version: v[1] };
}

/**
 * Records a signed-in session on the account itself (no separate database): the
 * country Vercel detected for the request, and, from the desktop app, a `desktop`
 * mark. Written at most every 30 minutes per account unless something changed.
 */
export async function markSeen(uid: string, seen: { country: string | null; agent: { os: string | null; version: string | null } | null }) {
  const token = await googleAccessToken();
  const api = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}`;
  const res = await fetch(`${api}/accounts:lookup`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ localId: [uid] }), cache: "no-store",
  });
  const user = ((await res.json().catch(() => ({}))).users ?? [])[0] as RestUser | undefined;
  if (!res.ok || !user) throw new Error(`Couldn't read the account (${res.status})`);
  const attrs = attributes(user);
  const now = new Date().toISOString();
  const next: Record<string, unknown> = { ...attrs };
  let changed = false;
  if (seen.country && attrs.country !== seen.country) { next.country = seen.country; changed = true; }
  if (seen.agent) {
    const prev = attrs.desktop as DesktopMark | undefined;
    if (!prev || Date.now() - Date.parse(prev.last) >= 30 * 60_000 || prev.v !== seen.agent.version) {
      next.desktop = { first: prev?.first ?? now, last: now, os: seen.agent.os, v: seen.agent.version, opens: (prev?.opens ?? 0) + 1 } satisfies DesktopMark;
      changed = true;
    }
  }
  if (!changed) return;
  const update = await fetch(`${api}/accounts:update`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(next) }), cache: "no-store",
  });
  if (!update.ok) throw new Error(`Couldn't update the account (${update.status})`);
}

/** Registered accounts per country (ISO alpha-2), from the `country` markSeen records. */
export async function accountsByCountry(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const u of await listUsers()) {
    const c = attributes(u).country;
    if (typeof c === "string" && c) out[c] = (out[c] ?? 0) + 1;
  }
  return out;
}

export interface DesktopPerson {
  /** Signed in (email known), or used the app without signing in. */
  known: boolean;
  email: string | null;
  name: string | null;
  photo: string | null;
  os: string | null;
  version: string | null;
  firstSeen: string | null;
  lastSeen: string;
  /** App opens for signed-in people, page views for unknown ones. */
  count: number;
}

export interface DesktopPeople { people: DesktopPerson[]; notes: string[] }

/**
 * Everyone who used the desktop app in the last 30 days: signed-in accounts from
 * their `desktop` attribute, plus anonymous app visitors from PostHog as "unknown"
 * (one row per anonymous ID, which changes daily in cookieless mode).
 */
export async function desktopPeople(): Promise<DesktopPeople> {
  const since = Date.now() - 30 * DAY;
  const [known, unknown] = await Promise.allSettled([
    canListUsers() ? listUsers() : Promise.reject(new Error("Add FIREBASE_SERVICE_ACCOUNT to see signed-in app users.")),
    canQueryVisitors()
      ? hogql<[string, string, string, number, string | null, string | null]>(
        `SELECT distinct_id, min(timestamp) AS first, max(timestamp) AS last, count() AS views,
                any(properties.$os) AS os, any(properties.$raw_user_agent) AS ua
         FROM events
         WHERE event = '$pageview' AND timestamp > now() - INTERVAL 30 DAY
           AND (properties.app = 'desktop' OR properties.$raw_user_agent LIKE '%PDFellaDesktop%')
         GROUP BY distinct_id
         HAVING countIf(properties.signed_in = true) = 0
         ORDER BY last DESC LIMIT 200`)
      : Promise.reject(new Error("Add POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to see app users who aren't signed in.")),
  ]);
  const people: DesktopPerson[] = [];
  const notes: string[] = [];
  if (known.status === "fulfilled") {
    for (const u of known.value) {
      const d = attributes(u).desktop as DesktopMark | undefined;
      if (!d || Date.parse(d.last) < since) continue;
      people.push({ known: true, email: u.email ?? null, name: u.displayName ?? null, photo: u.photoUrl ?? null, os: d.os, version: d.v, firstSeen: d.first, lastSeen: d.last, count: d.opens });
    }
  } else notes.push((known.reason as Error).message);
  if (unknown.status === "fulfilled") {
    for (const [, first, last, views, os, ua] of unknown.value) {
      const agent = ua ? desktopAgent(ua) : null;
      people.push({
        known: false, email: null, name: null, photo: null,
        os: agent?.os ?? (os === "Windows" ? "windows" : os?.toLowerCase().includes("mac") ? "mac" : null),
        version: agent?.version ?? null, firstSeen: new Date(first).toISOString(), lastSeen: new Date(last).toISOString(), count: views,
      });
    }
  } else notes.push((unknown.reason as Error).message);
  people.sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
  return { people, notes };
}
