import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", viewport: { width: 1440, height: 900 } },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    // E2E_PROD=1 (and CI) test the production build; otherwise reuse/start the dev server.
    command: process.env.CI || process.env.E2E_PROD ? `npm run build && npm run start -- -p ${PORT}` : `npm run dev -- -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    // Signed URLs and worker callbacks must point at the server under test.
    env: { STRIPE_SECRET_KEY: "sk_test_not_a_real_key", STRIPE_WEBHOOK_SECRET: "whsec_test_only", STRIPE_PRICE_LITE_YEARLY: "price_test_ly", STRIPE_PRICE_LITE_MONTHLY: "price_test_lm", STRIPE_PRICE_PRO_YEARLY: "price_test_py", STRIPE_PRICE_PRO_MONTHLY: "price_test_pm", NEXT_PUBLIC_PLANS_ENABLED: "test", NEXT_PUBLIC_SHARE_ENABLED: "1", SHARE_BACKEND: "local", APP_URL: `http://localhost:${PORT}`, NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`, ...(process.env.CI || process.env.E2E_PROD ? { NEXT_DIST_DIR: ".next-e2e" } : {}) },
    timeout: 180_000,
  },
});
