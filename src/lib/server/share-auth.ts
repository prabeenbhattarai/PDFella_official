import "server-only";
import { bearer, PROJECT_ID, verifyIdToken } from "./firebase-auth";

export const LOCAL_USER = "local";

/** Who is making this request, or null. Without sign-in configured (local development) everyone is one test user. */
export async function shareUser(req: Request): Promise<{ uid: string; email: string | null } | null> {
  if (!PROJECT_ID) return { uid: LOCAL_USER, email: null };
  const token = bearer(req);
  if (!token) return null;
  try {
    const p = await verifyIdToken(token);
    return { uid: p.sub!, email: p.email ?? null };
  } catch {
    return null;
  }
}
