import { json, fail } from "@/lib/server/http";
import { AdminAuthError, requireAdmin } from "@/lib/server/admin";
import { savedCustomer } from "@/lib/server/billing";
import { customerPayments } from "@/lib/server/payments";

export const dynamic = "force-dynamic";

/** One account's payments, read from Stripe. Read-only, admin only. */
export async function GET(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  try {
    await requireAdmin(req);
  } catch (e) {
    if (e instanceof AdminAuthError) return fail(e.status, e.status === 401 ? "unauthorized" : "forbidden", e.message);
    console.error("admin auth backend failed:", e);
    return fail(500, "internal", "The admin back end failed to start. See the Vercel function logs.");
  }
  if (!process.env.STRIPE_SECRET_KEY) return fail(503, "unavailable", "Add STRIPE_SECRET_KEY to see payments.");
  try {
    const customer = await savedCustomer((await params).uid);
    if (!customer) return json({ rows: [], card: null, stripeUrl: null }, 200, { "X-Robots-Tag": "noindex" });
    return json(await customerPayments(customer), 200, { "X-Robots-Tag": "noindex" });
  } catch (e) {
    return fail(502, "upstream", `Couldn't read payments from Stripe: ${(e as Error).message}`);
  }
}
