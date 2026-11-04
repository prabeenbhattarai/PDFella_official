import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fixturePath, openInEditor } from "./helpers";

test("documents open in tabs, keep their own pages and edits, and close", async ({ page }) => {
  await openInEditor(page);
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(1);
  const firstPages = await page.locator("[data-page-index]").count();

  await page.getByRole("button", { name: "New tab" }).click();
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveText(/New tab/);
  await page.getByRole("button", { name: /Start with a blank page/ }).click();
  await expect(page.locator("[data-page-index]")).toHaveCount(1);
  await expect(tabs.nth(1)).toHaveText(/Untitled\.pdf/);

  // Back to the first document: its pages render again.
  await tabs.nth(0).click();
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-page-index]")).toHaveCount(firstPages);
  await expect(page.locator("[data-page-index='0'] canvas").first()).toBeVisible();

  // Closing the open tab shows the other one.
  await tabs.nth(0).getByRole("button", { name: /^Close/ }).click();
  await expect(tabs).toHaveCount(1);
  await expect(tabs.nth(0)).toHaveText(/Untitled\.pdf/);
  await expect(page.locator("[data-page-index]")).toHaveCount(1);
});

test.describe("in the desktop app", () => {
  test.use({ userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15 PDFellaDesktop/0.1.5" });

  const dropOnWindow = (page: import("@playwright/test").Page, name: string) => page.evaluate(async ([fileName, base64]) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], fileName, { type: "application/pdf" }));
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, [name, readFileSync(fixturePath("sample.pdf")).toString("base64")]);

  test("a dropped file opens in a new tab, and from another page opens the editor", async ({ page }) => {
    await openInEditor(page);
    await dropOnWindow(page, "second.pdf");
    await expect(page.getByRole("tab")).toHaveCount(2);
    await expect(page.getByRole("tab").nth(1)).toHaveText(/second\.pdf/);

    await page.goto("/privacy");
    await dropOnWindow(page, "third.pdf");
    await page.waitForURL(/\/editor/);
    await expect(page.getByRole("tab").first()).toHaveText(/third\.pdf/);
  });

  test("a double-clicked file arriving from the app opens in the editor", async ({ page }) => {
    await page.goto("/privacy");
    await page.waitForFunction(() => !!window.__pdfellaFileDone);
    // Exactly what desktop/src-tauri/src/lib.rs sends: the bytes in base64 pieces.
    const file = readFileSync(fixturePath("sample.pdf"));
    const cut = 300; // A multiple of 3, like the app's chunks.
    await page.evaluate(([a, b]) => {
      window.__pdfellaIncoming = [{ name: "Contract ए.pdf", chunks: [a, b], done: true }];
      window.__pdfellaFileDone!();
    }, [file.subarray(0, cut).toString("base64"), file.subarray(cut).toString("base64")]);
    await page.waitForURL(/\/editor/);
    await expect(page.getByRole("tab").first()).toHaveText(/Contract ए\.pdf/);
    await expect(page.locator("[data-page-index]").first()).toBeVisible();
  });

  test("losing the connection shows an error until it's back", async ({ page, context }) => {
    await openInEditor(page);
    await expect(page.getByTestId("no-connection")).toHaveCount(0);
    await context.setOffline(true);
    await expect(page.getByTestId("no-connection")).toContainText("No internet connection");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("no-connection")).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByTestId("no-connection")).toHaveCount(0);
    await expect(page.locator("[data-page-index]").first()).toBeVisible();
  });

  test("a website visitor's stray drop is left alone", async ({ page, browser }) => {
    const web = await (await browser.newContext({ userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15" })).newPage();
    await web.goto("/privacy");
    expect(await web.evaluate(() => typeof window.__pdfellaFileDone)).toBe("undefined");
    await page.close();
  });
});
