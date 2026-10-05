import { test, expect } from "@playwright/test";
import { fixturePath } from "./helpers";
import { writeFileSync, mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";

test("landing page explains the product and has an upload area", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("PDF editor");
  await expect(page.getByTestId("dropzone")).toBeVisible();
  await expect(page.getByText("No account required")).toBeVisible();
});

test("uploading a PDF on the landing page opens it in the editor", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  await expect(page).toHaveURL(/\/editor/);
  await expect(page.locator("[data-page-index]")).toHaveCount(3);
});

test("a file with a fake .pdf extension is rejected with a friendly message", async ({ page }) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "e2e-"));
  const fake = path.join(dir, "invoice.pdf");
  writeFileSync(fake, Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]));
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(fake);
  await expect(page.getByText(/couldn't recognise/)).toBeVisible();
  await expect(page).toHaveURL("/");
});

test("tool pages are pre-rendered with SEO metadata and FAQ schema", async ({ page }) => {
  await page.goto("/compress-pdf");
  await expect(page).toHaveTitle(/Compress PDF/);
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toContain("/compress-pdf");
  expect(await page.locator('script[type="application/ld+json"]').count()).toBeGreaterThan(0);
});

test("sitemap lists tool pages", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("/merge-pdf");
  expect(xml).toContain("/ocr-pdf");
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});
