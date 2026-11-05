import { describe, expect, it } from "vitest";
import { claimTier } from "@/lib/plan-claim";

describe("plan claims", () => {
  const now = Date.parse("2026-11-10T00:00:00Z");
  it("recognises active plans", () => {
    expect(claimTier({ id: "pro", until: "2026-12-01T00:00:00Z" }, now)).toBe("pro");
    expect(claimTier({ id: "lite", until: "2026-12-01T00:00:00Z" }, now)).toBe("lite");
    expect(claimTier({ id: "pro", until: null }, now)).toBe("pro");
  });
  it("treats expired, missing or malformed plans as free", () => {
    expect(claimTier({ id: "pro", until: "2026-11-09T00:00:00Z" }, now)).toBe("free");
    expect(claimTier({ id: "business" }, now)).toBe("free");
    expect(claimTier(undefined, now)).toBe("free");
    expect(claimTier({ id: "lite", until: 5 }, now)).toBe("free");
  });
});
