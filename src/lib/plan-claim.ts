export type Tier = "free" | "lite" | "pro";

/** The `billingPaused` claim: a renewal failed, so this plan is paused until it's paid. */
export function pausedClaim(claim: unknown): { plan: "lite" | "pro" } | null {
  const p = (claim as { plan?: unknown } | null | undefined)?.plan;
  return p === "lite" || p === "pro" ? { plan: p } : null;
}

/** A plan claim on the account: `{ id: "lite" | "pro", until: ISO date or null }`. */
export function claimTier(claim: unknown, now = Date.now()): Tier {
  const c = claim as { id?: unknown; until?: unknown } | null | undefined;
  if (c?.id !== "lite" && c?.id !== "pro") return "free";
  return !c.until || (typeof c.until === "string" && Date.parse(c.until) > now) ? c.id : "free";
}
