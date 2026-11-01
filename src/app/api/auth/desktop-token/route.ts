import { fail, json, sameOrigin } from "@/lib/server/http";
import { bearer, createCustomToken, TokenError, verifyIdToken } from "@/lib/server/firebase-auth";

export const dynamic = "force-dynamic";

/**
 * Desktop sign-in hand-over. Google blocks OAuth inside embedded web views, so
 * the desktop app signs in through the system browser: the browser signs in
 * normally, sends its ID token here and gets a short-lived Firebase custom token
 * for the same user, which it passes (encrypted) back to the app.
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
  try {
    return json({ customToken: await createCustomToken(uid) });
  } catch (e) {
    console.error("desktop custom token failed:", (e as Error).message);
    return fail(503, "unavailable", "Desktop sign-in isn't available right now.");
  }
}
