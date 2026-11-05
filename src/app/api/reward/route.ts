import { json, fail, clientIp, sameOrigin } from "@/lib/server/http";
import { accountAttributes, accountIdentity, canListUsers, patchAccount } from "@/lib/server/admin";
import { bearer, verifyIdToken } from "@/lib/server/firebase-auth";
import { getLimiter } from "@/lib/server/ratelimit";
import { claimIp, ipHasClaimed, recordSource, releaseIp } from "@/lib/server/reward-store";
import { hashClient } from "@/lib/server/tokens";
import { claimTier } from "@/lib/plan-claim";
import { isRewardFeature, isRewardSource, REWARD_HOURS, rewardRefusal } from "@/lib/reward";

export const dynamic = "force-dynamic";

const offered = () => !!process.env.NEXT_PUBLIC_PLANS_ENABLED && canListUsers();

async function refusalFor(uid: string) {
  const [attrs, account] = await Promise.all([accountAttributes(uid), accountIdentity(uid)]);
  return rewardRefusal({ claimed: attrs.welcomeReward, paid: claimTier(attrs.plan) !== "free", createdAt: account.createdAt });
}

const accountId = async (req: Request) => {
  const token = bearer(req);
  if (!token) return null;
  try { return (await verifyIdToken(token)).sub ?? null; } catch { return null; }
};

/** Whether to offer the survey: a new IP address and, if signed in, a new unpaid account. Any doubt means no. */
export async function GET(req: Request) {
  if (!offered()) return json({ eligible: false });
  try {
    if (await ipHasClaimed(hashClient(clientIp(req)))) return json({ eligible: false });
    const uid = await accountId(req);
    if (uid && await refusalFor(uid)) return json({ eligible: false });
    return json({ eligible: true });
  } catch (e) {
    console.error("[reward] check failed:", (e as Error).message);
    return json({ eligible: false });
  }
}

/** Claim the reward. Signing in is required, and it can only happen once per account and per IP. */
export async function POST(req: Request) {
  if (!offered()) return fail(503, "unavailable", "This offer isn't available right now.");
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-origin request rejected");
  const uid = await accountId(req);
  if (!uid) return fail(401, "unauthorized", "Sign in to claim your free feature.");
  const body = await req.json().catch(() => null) as { source?: unknown; feature?: unknown } | null;
  if (!isRewardSource(body?.source) || !isRewardFeature(body?.feature)) return fail(400, "bad_request", "Choose an answer and a feature.");

  const ip = hashClient(clientIp(req));
  try {
    const { ok } = await getLimiter().hit(`rw_${ip}`, 10, 3600);
    if (!ok) return fail(429, "rate_limited", "Too many tries. Please try again later.");
    const refusal = await refusalFor(uid);
    if (refusal === "claimed") return fail(409, "already_claimed", "You've already claimed your free feature.");
    if (refusal === "paid") return fail(409, "already_paid", "You already have a paid plan.");
    if (refusal === "not_new") return fail(403, "not_new", "This offer is only for new accounts.");
    if (!await claimIp(ip)) return fail(409, "ip_claimed", "A free feature has already been claimed from this network.");

    const now = Date.now();
    const until = new Date(now + REWARD_HOURS * 3_600_000).toISOString();
    try {
      await patchAccount(uid, { welcomeReward: { feature: body.feature, until, at: new Date(now).toISOString(), source: body.source } });
    } catch (e) {
      await releaseIp(ip).catch(() => {});
      throw e;
    }
    await recordSource(body.source).catch((e) => console.error("[reward] answer not saved:", (e as Error).message));
    return json({ feature: body.feature, until });
  } catch (e) {
    console.error("[reward] claim failed:", (e as Error).message);
    return fail(502, "upstream", "We couldn't save that. Please try again.");
  }
}
