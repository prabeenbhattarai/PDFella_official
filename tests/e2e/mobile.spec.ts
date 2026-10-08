import { test, expect } from "@playwright/test";
import { fixturePath } from "./helpers";

test("mobile: landing upload opens the editor with a bottom toolbar", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  await expect(page).toHaveURL(/\/editor/);
  const toolbar = page.getByRole("toolbar", { name: "Tools" }).last();
  await expect(toolbar).toBeVisible();
  const box = await toolbar.boundingBox();
  expect(box!.y).toBeGreaterThan(page.viewportSize()!.height / 2);
});

test("mobile: tap PDF text to edit it in a sheet above the keyboard", async ({ page }) => {
  await page.goto("/editor");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  const pg = page.locator('[data-page-index="0"]');
  await expect(pg).toBeVisible();
  // Wait for fit-to-width zoom to settle so the tap lands on the line.
  let last = -1;
  await expect.poll(async () => {
    const w = (await pg.boundingBox())?.width ?? 0;
    const stable = w > 0 && w === last;
    last = w;
    return stable;
  }, { intervals: [300] }).toBe(true);
  const b = (await pg.boundingBox())!;
  const z = b.width / 595.28;
  await page.touchscreen.tap(b.x + 120 * z, b.y + 142 * z); // "Payment terms: 60 days…"
  const sheet = page.locator("[data-mobile-text-sheet]");
  await expect(sheet).toBeVisible();
  const field = sheet.getByRole("textbox", { name: "Text" });
  await expect(field).toHaveValue("Payment terms: 60 days from the date of invoice.");
  await field.fill("Payment terms: 30 days from the date of invoice.");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('[data-kind="textEdit"]')).toContainText("30 days");
});
