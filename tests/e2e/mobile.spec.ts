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
