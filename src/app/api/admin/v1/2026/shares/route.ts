import { json, fail } from "@/lib/server/http";
import { AdminAuthError, requireAdmin } from "@/lib/server/admin";
import { shareConfig } from "@/lib/server/config";
import { getShares, type ShareReport } from "@/lib/server/shares";

export const dynamic = "force-dynamic";

export interface AdminShare { id: string; ownerEmail: string | null; size: number; createdAt: number; expiresAt: number; hasPassword: boolean; reports: ShareReport[] }

/** Recent share links, reported ones first. The files are encrypted, so this holds no names or contents. Admin only. */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) return fail(e.status, e.status === 401 ? "unauthorized" : "forbidden", e.message);
    return fail(500, "internal", "The admin back end failed to start. See the Vercel function logs.");
  }
  if (shareConfig().backend === "off") return json({ available: false, links: [] }, 200, { "X-Robots-Tag": "noindex" });
  try {
    const records = await getShares().listRecent(200);
    const links: AdminShare[] = records
      .filter((r) => r.status === "ready" && r.expiresAt > Date.now())
      .sort((a, b) => b.reports.length - a.reports.length || b.createdAt - a.createdAt)
      .map((r) => ({ id: r.id, ownerEmail: r.ownerEmail, size: r.size, createdAt: r.createdAt, expiresAt: r.expiresAt, hasPassword: !!r.salt, reports: r.reports }));
    return json({ available: true, links }, 200, { "X-Robots-Tag": "noindex" });
  } catch (e) {
    return fail(502, "upstream", `Couldn't read share links: ${(e as Error).message}`);
  }
}
