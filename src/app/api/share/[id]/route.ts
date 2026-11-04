import { json, fail, clientIp, sameOrigin } from "@/lib/server/http";
import { shareConfig } from "@/lib/server/config";
import { hashClient } from "@/lib/server/tokens";
import { getLimiter } from "@/lib/server/ratelimit";
import { getShareObjects } from "@/lib/server/storage";
import { deleteShare, getShares, isLive, shareObjectKey, validShareId } from "@/lib/server/shares";
import { shareUser } from "@/lib/server/share-auth";

export const dynamic = "force-dynamic";

const GONE = () => fail(404, "not_found", "This link has expired or been removed");

/** What the recipient's browser needs to fetch and decrypt the file. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (shareConfig().backend === "off" || !validShareId(id)) return GONE();
  const { ok } = await getLimiter().hit(`sg_${hashClient(clientIp(req))}`, 120, 3600);
  if (!ok) return fail(429, "rate_limited", "Too many requests. Please try again later.");
  const r = await getShares().get(id);
  if (!isLive(r)) return GONE();
  const url = await getShareObjects().signedDownloadUrl(shareObjectKey(id), "shared.bin");
  return json({ nameCt: r.nameCt, salt: r.salt, iterations: r.iterations, size: r.size, expiresAt: r.expiresAt, url }, 200, { "X-Robots-Tag": "noindex" });
}

/** The sender deletes their own link. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-origin request rejected");
  if (shareConfig().backend === "off" || !validShareId(id)) return GONE();
  const user = await shareUser(req);
  if (!user) return fail(401, "unauthorized", "Sign in to manage your links");
  const r = await getShares().get(id);
  if (!r || r.ownerId !== user.uid) return GONE();
  await deleteShare(id);
  return new Response(null, { status: 204 });
}
