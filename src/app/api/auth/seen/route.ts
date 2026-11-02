import { fail, sameOrigin } from "@/lib/server/http";
import { bearer, TokenError, verifyIdToken } from "@/lib/server/firebase-auth";
import { canListUsers, desktopAgent, markSeen } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

/**
 * A signed-in session reports here once (components/auth/auth-provider.tsx), so the
 * admin panel can show each account's country and who uses the desktop app. Only the
 * caller's own account is touched. The country is Vercel's IP geolocation header;
 * the IP itself isn't stored.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-origin request.");
  const token = bearer(req);
  if (!token) return fail(401, "unauthorized", "Sign in first.");
  let uid: string;
  try {
    uid = (await verifyIdToken(token)).sub!;
  } catch (e) {
    return fail(401, "unauthorized", `Sign-in couldn't be verified (${e instanceof TokenError ? e.code : "error"}).`);
  }
  if (!canListUsers()) return new Response(null, { status: 204 });
  const country = req.headers.get("x-vercel-ip-country")?.toUpperCase().match(/^[A-Z]{2}$/)?.[0] ?? null;
  try {
    await markSeen(uid, { country, agent: desktopAgent(req.headers.get("user-agent") ?? "") });
  } catch (e) {
    console.error("seen failed:", (e as Error).message);
  }
  return new Response(null, { status: 204 });
}
