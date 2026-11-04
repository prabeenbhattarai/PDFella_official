import { fail } from "@/lib/server/http";
import { AdminAuthError, requireAdmin } from "@/lib/server/admin";
import { shareConfig } from "@/lib/server/config";
import { deleteShare, validShareId } from "@/lib/server/shares";

export const dynamic = "force-dynamic";

/** Take a link down: its file and record are deleted, and the link stops working. Admin only. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) return fail(e.status, e.status === 401 ? "unauthorized" : "forbidden", e.message);
    return fail(500, "internal", "The admin back end failed to start. See the Vercel function logs.");
  }
  const { id } = await params;
  if (shareConfig().backend === "off" || !validShareId(id)) return fail(404, "not_found", "Not found");
  await deleteShare(id);
  return new Response(null, { status: 204 });
}
