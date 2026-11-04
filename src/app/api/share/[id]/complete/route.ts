import { json, fail, sameOrigin } from "@/lib/server/http";
import { getShareObjects } from "@/lib/server/storage";
import { deleteShare, getShares, shareObjectKey, validShareId } from "@/lib/server/shares";
import { shareUser } from "@/lib/server/share-auth";

export const dynamic = "force-dynamic";

/** The upload finished: check it's the size that was declared, then let the link work. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-origin request rejected");
  if (!validShareId(id)) return fail(404, "not_found", "Not found");
  const user = await shareUser(req);
  if (!user) return fail(401, "unauthorized", "Sign in to create a share link");
  const record = await getShares().get(id);
  if (!record || record.ownerId !== user.uid) return fail(404, "not_found", "Not found");
  const size = await getShareObjects().size(shareObjectKey(id));
  if (size !== record.size) {
    await deleteShare(id);
    return fail(400, "bad_upload", "The upload didn't complete. Please try again.");
  }
  await getShares().update(id, { status: "ready" });
  return json({ id });
}
