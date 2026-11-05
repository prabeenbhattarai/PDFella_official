import { json, fail } from "@/lib/server/http";
import { accountAttributes, AdminAuthError, canListUsers, requireAdmin, setUserPlan } from "@/lib/server/admin";
import { claimTier } from "@/lib/plan-claim";

export const dynamic = "force-dynamic";

/** Give an account a plan for a number of days, or remove it with `plan: null`. Admin only. */
export async function POST(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  try {
    await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) return fail(e.status, e.status === 401 ? "unauthorized" : "forbidden", e.message);
    return fail(500, "internal", "The admin back end failed to start. See the Vercel function logs.");
  }
  if (!canListUsers()) return fail(503, "unavailable", "Add FIREBASE_SERVICE_ACCOUNT to change accounts.");
  const { uid } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return fail(400, "bad_request", "Invalid account ID.");
  const body = await req.json().catch(() => null) as { plan?: unknown; days?: unknown } | null;
  const plan = body?.plan;
  if (plan !== null && plan !== "lite" && plan !== "pro") return fail(400, "bad_request", "Choose a plan.");
  const days = body?.days;
  if (plan && !(typeof days === "number" && Number.isInteger(days) && days > 0 && days <= 3660)) return fail(400, "bad_request", "Choose a number of days.");
  try {
    // Stripe decides a paying customer's plan. Changing it here would leave them being charged.
    const attrs = await accountAttributes(uid);
    if (attrs.stripeCustomer && claimTier(attrs.plan) !== "free") return fail(409, "pays_through_stripe", "This account pays through Stripe. Change or cancel the subscription in the Stripe dashboard, and the plan will follow.");
    await setUserPlan(uid, plan, days as number | undefined);
    return json({ ok: true });
  } catch (e) {
    return fail(502, "upstream", `Couldn't update the plan: ${(e as Error).message}`);
  }
}
