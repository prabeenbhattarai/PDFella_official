import { fail, sameOrigin } from "@/lib/server/http";
import { bearer, TokenError, verifyIdToken } from "@/lib/server/firebase-auth";
import { canListUsers, desktopAgent, markDesktopUse } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

/**
 * The desktop app reports a signed-in session here (components/auth/auth-provider.tsx),
 * so the admin panel can list who uses the app. Only the caller's own account is marked,
 * and only from the app's user agent.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-origin request.");
  const agent = desktopAgent(req.headers.get("user-agent") ?? "");
  if (!agent) return new Response(null, { status: 204 });
  const token = bearer(req);
  if (!token) return fail(401, "unauthorized", "Sign in first.");
  let uid: string;
  try {
    uid = (await verifyIdToken(token)).sub!;
  } catch (e) {
    return fail(401, "unauthorized", `Sign-in couldn't be verified (${e instanceof TokenError ? e.code : "error"}).`);
  }
  if (!canListUsers()) return new Response(null, { status: 204 });
  try {
    await markDesktopUse(uid, agent);
  } catch (e) {
    console.error("desktop-seen failed:", (e as Error).message);
  }
  return new Response(null, { status: 204 });
}
