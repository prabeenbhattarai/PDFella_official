import { test, expect } from "@playwright/test";
import { openInEditor } from "./helpers";

test("guided tour: welcome, step through with buttons and keys, remembered when finished", async ({ page }) => {
  await openInEditor(page);
  // Never auto-starts under automation; open it from the ⋯ menu.
  await expect(page.locator("[data-editor-tour]")).toHaveCount(0);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Take the tour" }).click();

  const tour = page.getByRole("dialog");
  await expect(tour).toContainText("Welcome to the PDFella editor");
  await tour.getByRole("button", { name: /Start tour/ }).click();
  await expect(tour).toContainText("Step 1 of");
  await expect(tour).toContainText("Edit the text in your PDF");
  await tour.getByRole("button", { name: /^Next/ }).click();
  await expect(tour).toContainText("Add new text");
  await page.keyboard.press("ArrowLeft");
  await expect(tour).toContainText("Edit the text in your PDF");
  // Walk to the end with the keyboard.
  for (let i = 0; i < 12 && !(await tour.textContent())?.includes("You're all set"); i++) await page.keyboard.press("ArrowRight");
  await expect(tour).toContainText("You're all set");
  await tour.getByRole("button", { name: "Start editing" }).click();
  await expect(page.locator("[data-editor-tour]")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("pdfella.tour.v1"))).toBe("1");
});

test("skip closes the tour from any step", async ({ page }) => {
  await openInEditor(page);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Take the tour" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Start tour/ }).click();
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.locator("[data-editor-tour]")).toHaveCount(0);
});

test("insert a blank page between pages from the thumbnails and from the page gap", async ({ page }) => {
  await openInEditor(page); // sample.pdf: 3 pages
  await expect(page.locator("[data-page-index]")).toHaveCount(3);
  const thumbs = page.getByRole("listbox", { name: "Pages" });
  await thumbs.locator("[data-insert-gap='1']").hover();
  await thumbs.getByRole("button", { name: "Insert blank page after page 1" }).click();
  await expect(page.locator("[data-page-index]")).toHaveCount(4);
  await expect(thumbs.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");

  await page.locator("#document-scroller").getByRole("button", { name: "Insert blank page after page 4" }).click();
  await expect(page.locator("[data-page-index]")).toHaveCount(5);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("[data-page-index]")).toHaveCount(4);
});
