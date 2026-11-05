import { json, fail } from "@/lib/server/http";
import { AdminAuthError, requireAdmin } from "@/lib/server/admin";
import { sourceCounts } from "@/lib/server/reward-store";

export const dynamic = "force-dynamic";

/** How new users say they found us, from the welcome survey. Admin only. */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) return fail(e.status, e.status === 401 ? "unauthorized" : "forbidden", e.message);
    return fail(500, "internal", "The admin back end failed to start. See the Vercel function logs.");
  }
  try {
    return json({ counts: await sourceCounts() }, 200, { "X-Robots-Tag": "noindex" });
  } catch (e) {
    return fail(502, "upstream", `Couldn't read the survey: ${(e as Error).message}`);
  }
}
