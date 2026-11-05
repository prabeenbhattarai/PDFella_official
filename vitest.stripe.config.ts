import { defineConfig } from "vitest/config";
import path from "node:path";

// Talks to Stripe's test mode, so it's separate from the normal test run.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["tests/stripe/**/*.test.ts"], testTimeout: 180_000, hookTimeout: 60_000 },
});
