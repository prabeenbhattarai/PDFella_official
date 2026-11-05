/**
 * The welcome reward: tell us how you found PDFella, and get one paid feature for a day.
 * Each Google account and each IP address can only ever claim it once.
 */
export const REWARD_HOURS = 24;
/** Only new accounts qualify, so this rewards first-time users. */
export const NEW_ACCOUNT_DAYS = 7;

export const REWARD_SOURCES = [
  { id: "search", label: "Google or another search engine" },
  { id: "ai", label: "ChatGPT or another AI assistant" },
  { id: "social", label: "Social media" },
  { id: "video", label: "YouTube or another video" },
  { id: "friend", label: "A friend or colleague" },
  { id: "forum", label: "Reddit or a forum" },
  { id: "other", label: "Somewhere else" },
] as const;

export const REWARD_FEATURES = [
  { id: "signature", label: "Signatures" },
  { id: "stamp", label: "Stamps" },
  { id: "fonts", label: "50+ extra fonts" },
  { id: "tabs", label: "Multiple tabs" },
  { id: "pages", label: "Adding pages" },
  { id: "crop", label: "Crop in the editor" },
  { id: "bookmarks", label: "Bookmarks in the editor" },
  { id: "redact", label: "Redaction" },
  { id: "forms", label: "Building forms" },
  { id: "templates", label: "Templates" },
  { id: "bulk-fill", label: "Filling forms from a spreadsheet" },
] as const;

export type RewardFeature = (typeof REWARD_FEATURES)[number]["id"];
export const isRewardFeature = (v: unknown): v is RewardFeature => REWARD_FEATURES.some((f) => f.id === v);
export const isRewardSource = (v: unknown): v is (typeof REWARD_SOURCES)[number]["id"] => REWARD_SOURCES.some((s) => s.id === v);
export const rewardLabel = (id: string) => REWARD_FEATURES.find((f) => f.id === id)?.label ?? id;

/** The stored reward: `{ feature, until, at, source }`. */
export interface RewardClaim { feature: string; until: string; at?: string; source?: string }

/** The feature an account's reward unlocks right now, if any. */
export function activeReward(claim: unknown, now = Date.now()): { feature: RewardFeature; until: string } | null {
  const c = claim as Partial<RewardClaim> | null | undefined;
  if (!c || !isRewardFeature(c.feature) || typeof c.until !== "string") return null;
  return Date.parse(c.until) > now ? { feature: c.feature, until: c.until } : null;
}

/** Why an account can't claim the reward, or null if it can. Applied on the server. */
export function rewardRefusal(account: { claimed: unknown; paid: boolean; createdAt: number | null }, now = Date.now()): "claimed" | "paid" | "not_new" | null {
  if (account.claimed) return "claimed";
  if (account.paid) return "paid";
  if (!account.createdAt || now - account.createdAt > NEW_ACCOUNT_DAYS * 86_400_000) return "not_new";
  return null;
}
