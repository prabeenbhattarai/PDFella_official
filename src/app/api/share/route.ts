import { json, fail, sameOrigin } from "@/lib/server/http";
import { shareConfig } from "@/lib/server/config";
import { getShareObjects } from "@/lib/server/storage";
import { getLimiter } from "@/lib/server/ratelimit";
import { getShares, isLive, newShareId, shareObjectKey, SHARE_DAYS, SHARE_MAX_ACTIVE, SHARE_MAX_BYTES } from "@/lib/server/shares";
import { LOCAL_USER, shareUser } from "@/lib/server/share-auth";

export const dynamic = "force-dynamic";

const B64URL = /^[A-Za-z0-9_-]+$/;
const DAY = 86_400_000;

/** Whether sharing is available and, for the signed-in sender, their live links. */
export async function GET(req: Request) {
  if (shareConfig().backend === "off") return json({ available: false, links: [] });
  const user = await shareUser(req);
  const links = user ? (await getShares().listByOwner(user.uid)).filter((r) => isLive(r)).sort((a, b) => b.createdAt - a.createdAt).map((r) => ({ id: r.id, size: r.size, createdAt: r.createdAt, expiresAt: r.expiresAt })) : [];
  return json({ available: true, links });
}

/** Register an encrypted file and return a signed upload URL. File contents never pass through this server. */
export async function POST(req: Request) {
  if (shareConfig().backend === "off") return fail(503, "unavailable", "Share links aren't available");
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-origin request rejected");
  const user = await shareUser(req);
  if (!user) return fail(401, "unauthorized", "Sign in to create a share link");

  let body: { size?: unknown; days?: unknown; nameCt?: unknown; salt?: unknown; iterations?: unknown };
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Invalid JSON"); }
  const size = Number(body.size);
  const days = Number(body.days);
  if (!Number.isInteger(size) || size <= 0) return fail(400, "bad_request", "Invalid size");
  if (size > SHARE_MAX_BYTES) return fail(413, "too_large", "Share links can hold files up to 5 MB");
  if (!(SHARE_DAYS as readonly number[]).includes(days)) return fail(400, "bad_request", "Invalid expiry");
  if (typeof body.nameCt !== "string" || body.nameCt.length > 2048 || !B64URL.test(body.nameCt)) return fail(400, "bad_request", "Invalid name");
  const salt = body.salt === null || body.salt === undefined ? null : String(body.salt);
  const iterations = salt ? Number(body.iterations) : null;
  if (salt && (salt.length > 64 || !B64URL.test(salt) || !Number.isInteger(iterations) || iterations! < 100_000 || iterations! > 5_000_000)) return fail(400, "bad_request", "Invalid password settings");

  const shares = getShares();
  // The local test user (no sign-in configured) has no limits, so test runs don't trip them.
  if (user.uid !== LOCAL_USER) {
    const [burst, daily] = await Promise.all([getLimiter().hit(`sb_${user.uid}`, 10, 60), getLimiter().hit(`sd_${user.uid}`, 50, 86_400)]);
    if (!burst.ok || !daily.ok) return fail(429, "rate_limited", "You've created a lot of links. Please try again later.");
    const live = (await shares.listByOwner(user.uid)).filter((r) => r.expiresAt > Date.now());
    if (live.length >= SHARE_MAX_ACTIVE) return fail(409, "too_many", `You can have ${SHARE_MAX_ACTIVE} active links. Delete one to create another.`);
  }

  const id = newShareId();
  const now = Date.now();
  await shares.create({ id, ownerId: user.uid, ownerEmail: user.email, status: "uploading", size, nameCt: body.nameCt, salt, iterations, createdAt: now, expiresAt: now + days * DAY, reports: [] });
  const uploadUrl = await getShareObjects().signedUploadUrl(shareObjectKey(id), "application/octet-stream", SHARE_MAX_BYTES);
  // Cloud Storage only accepts the upload with the size limit that was signed into the URL.
  const uploadHeaders: Record<string, string> = { "Content-Type": "application/octet-stream", ...(shareConfig().backend === "firebase" ? { "x-goog-content-length-range": `0,${SHARE_MAX_BYTES}` } : {}) };
  return json({ id, uploadUrl, uploadHeaders, expiresAt: now + days * DAY }, 201);
}
