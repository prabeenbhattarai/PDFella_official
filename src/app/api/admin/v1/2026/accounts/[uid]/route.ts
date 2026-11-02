import { json, fail } from "@/lib/server/http";
import { AdminAuthError, canListUsers, requireAdmin, userDetail } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

/** One account in full: profile, country, desktop use and PostHog activity. Admin only. */
export async function GET(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  try {
    await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) return fail(e.status, e.status === 401 ? "unauthorized" : "forbidden", e.message);
    console.error("admin auth backend failed:", e);
    return fail(500, "internal", "The admin back end failed to start. See the Vercel function logs.");
  }
  if (!canListUsers()) return fail(503, "unavailable", "Add FIREBASE_SERVICE_ACCOUNT to read accounts.");
  try {
    const detail = await userDetail((await params).uid);
    return detail ? json(detail, 200, { "X-Robots-Tag": "noindex" }) : fail(404, "not_found", "No such account.");
  } catch (e) {
    return fail(502, "upstream", `Couldn't read the account: ${(e as Error).message}`);
  }
}
