import { describe, expect, it } from "vitest";
import { activeReward, isRewardFeature, isRewardSource, rewardRefusal, REWARD_FEATURES } from "@/lib/reward";

const DAY = 86_400_000;
const now = Date.parse("2026-11-10T00:00:00Z");

describe("who can claim the reward", () => {
  const fresh = { claimed: undefined, paid: false, createdAt: now - DAY };
  it("allows a new, unpaid account that hasn't claimed", () => expect(rewardRefusal(fresh, now)).toBeNull());
  it("refuses a second claim", () => expect(rewardRefusal({ ...fresh, claimed: { feature: "stamp" } }, now)).toBe("claimed"));
  it("refuses paying customers", () => expect(rewardRefusal({ ...fresh, paid: true }, now)).toBe("paid"));
  it("refuses older accounts, and accounts of unknown age", () => {
    expect(rewardRefusal({ ...fresh, createdAt: now - 8 * DAY }, now)).toBe("not_new");
    expect(rewardRefusal({ ...fresh, createdAt: null }, now)).toBe("not_new");
  });
});

describe("what the reward unlocks", () => {
  it("is the chosen feature until it ends", () => {
    const until = new Date(now + 1000).toISOString();
    expect(activeReward({ feature: "redact", until }, now)).toEqual({ feature: "redact", until });
  });
  it("ends on time, and ignores anything malformed", () => {
    expect(activeReward({ feature: "redact", until: new Date(now - 1).toISOString() }, now)).toBeNull();
    expect(activeReward({ feature: "not-a-feature", until: new Date(now + 1000).toISOString() }, now)).toBeNull();
    expect(activeReward(undefined, now)).toBeNull();
  });
  it("only accepts answers and features from the lists", () => {
    expect(isRewardFeature("signature")).toBe(true);
    expect(isRewardFeature("everything")).toBe(false);
    expect(isRewardSource("search")).toBe(true);
    expect(isRewardSource("<script>")).toBe(false);
    expect(REWARD_FEATURES.some((f) => (f.id as string) === "documents" || (f.id as string) === "more-tabs")).toBe(false);
  });
});
