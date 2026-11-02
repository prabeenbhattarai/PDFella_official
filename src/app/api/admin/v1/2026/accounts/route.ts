import { json, fail } from "@/lib/server/http";
import { AdminAuthError, canListUsers, requireAdmin, userPage } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

/** Every registered account, a page at a time (?page=1&size=20&q=search). Admin only. */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) return fail(e.status, e.status === 401 ? "unauthorized" : "forbidden", e.message);
    console.error("admin auth backend failed:", e);
    return fail(500, "internal", "The admin back end failed to start. See the Vercel function logs.");
  }
  if (!canListUsers()) return fail(503, "unavailable", "Add FIREBASE_SERVICE_ACCOUNT to list registered users.");
  const params = new URL(req.url).searchParams;
  const size = Math.min(100, Math.max(5, Number(params.get("size")) || 20));
  try {
    return json(await userPage({ page: Number(params.get("page")) || 1, size, q: params.get("q") ?? "" }), 200, { "X-Robots-Tag": "noindex" });
  } catch (e) {
    return fail(502, "upstream", `Couldn't read users: ${(e as Error).message}`);
  }
}
