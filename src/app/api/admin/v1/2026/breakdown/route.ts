import { json, fail } from "@/lib/server/http";
import { accountsByCountry, AdminAuthError, canListUsers, canQueryVisitors, insights, requireAdmin } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

/** Countries, sources, pages and devices for ?days=1|7|30, plus registered accounts by country. Admin only. */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) return fail(e.status, e.status === 401 ? "unauthorized" : "forbidden", e.message);
    console.error("admin auth backend failed:", e);
    return fail(500, "internal", "The admin back end failed to start. See the Vercel function logs.");
  }
  const raw = Number(new URL(req.url).searchParams.get("days"));
  const days = raw === 1 || raw === 30 ? raw : 7;
  const [traffic, accounts] = await Promise.all([
    canQueryVisitors()
      ? insights(days).then((data) => ({ data }), (e) => ({ error: `Couldn't read visitor details: ${(e as Error).message}` }))
      : { error: "Add POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to see countries, sources and devices." },
    canListUsers()
      ? accountsByCountry().then((data) => ({ data }), (e) => ({ error: `Couldn't read accounts: ${(e as Error).message}` }))
      : { error: "Add FIREBASE_SERVICE_ACCOUNT to count accounts by country." },
  ]);
  return json({ traffic, accounts }, 200, { "X-Robots-Tag": "noindex" });
}
