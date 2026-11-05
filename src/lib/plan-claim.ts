export type Tier = "free" | "lite" | "pro";

/** A plan claim on the account: `{ id: "lite" | "pro", until: ISO date or null }`. */
export function claimTier(claim: unknown, now = Date.now()): Tier {
  const c = claim as { id?: unknown; until?: unknown } | null | undefined;
  if (c?.id !== "lite" && c?.id !== "pro") return "free";
  return !c.until || (typeof c.until === "string" && Date.parse(c.until) > now) ? c.id : "free";
}
