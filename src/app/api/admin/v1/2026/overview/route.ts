import { json, fail } from "@/lib/server/http";
import { AdminAuthError, canListUsers, canQueryVisitors, desktopPeople, desktopUsage, downloadStats, requireAdmin, userStats, visitorStats } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

/** Admin dashboard numbers. Only for allowlisted, verified Google accounts. */
export async function GET(req: Request) {
  let admin: string;
  try {
    admin = await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) return fail(e.status, e.status === 401 ? "unauthorized" : "forbidden", e.message);
    // Details go to the logs only: this runs before we know who is asking.
    console.error("admin auth backend failed:", e);
    return fail(500, "internal", "The admin back end failed to start. See the Vercel function logs.");
  }

  // Each source fails on its own, so a missing PostHog key doesn't hide the user numbers.
  const [users, visitors, downloads, desktop, people] = await Promise.all([
    canListUsers()
      ? userStats().then((data) => ({ data }), (e) => ({ error: `Couldn't read users: ${(e as Error).message}` }))
      : { error: "Add FIREBASE_SERVICE_ACCOUNT to read registered users." },
    canQueryVisitors()
      ? visitorStats().then((data) => ({ data }), (e) => ({ error: `Couldn't read visitors: ${(e as Error).message}` }))
      : { error: "Add POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to count visitors." },
    downloadStats().then((data) => ({ data }), (e) => ({ error: `Couldn't read downloads: ${(e as Error).message}` })),
    canQueryVisitors()
      ? desktopUsage().then((data) => ({ data }), (e) => ({ error: `Couldn't read desktop users: ${(e as Error).message}` }))
      : { error: "Add POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to count desktop app users." },
    desktopPeople().then((data) => ({ data }), (e) => ({ error: `Couldn't list desktop app users: ${(e as Error).message}` })),
  ]);
  return json({ admin, generatedAt: new Date().toISOString(), users, visitors, downloads, desktop, people }, 200, { "X-Robots-Tag": "noindex" });
}
