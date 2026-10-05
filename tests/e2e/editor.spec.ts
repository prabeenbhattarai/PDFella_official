import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { openInEditor, pagePoint, saveAndDownload, downloadBytes, pdfText, objectCount } from "./helpers";

test("add text, save, rename and download a real PDF", async ({ page }) => {
  await openInEditor(page);
  await page.keyboard.press("t");
  const p = await pagePoint(page, 60, 420);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByRole("textbox", { name: "Text" })).toBeFocused();
  await page.keyboard.type("Approved by the board");
  await page.keyboard.press("Escape");
  const d = await saveAndDownload(page, "Final Contract - October 2026");
  expect(d.suggestedFilename()).toBe("Final Contract - October 2026.pdf");
  const text = await pdfText(await downloadBytes(d));
  expect(text).toHaveLength(3);
  expect(text[0]).toContain("Approved by the board");
});

test("edit existing text replaces it in the exported file", async ({ page }) => {
  await openInEditor(page);
  await page.keyboard.press("e");
  // Fixture line 2 ("Payment terms: 60 days…") sits at y≈135pt.
  const p = await pagePoint(page, 120, 142);
  await page.mouse.click(p.x, p.y);
  const editor = page.getByRole("textbox", { name: "Text" });
  await expect(editor).toBeVisible();
  await editor.fill("Payment terms: 30 days from the date of invoice.");
  await page.keyboard.press("Escape");
  const text = await pdfText(await downloadBytes(await saveAndDownload(page)));
  expect(text[0]).toContain("30 days");
  expect(text[0]).not.toContain("60 days");
});

test("highlight snaps to text, shapes draw, undo and redo work", async ({ page }) => {
  await openInEditor(page);
  await page.keyboard.press("m");
  const a = await pagePoint(page, 62, 122);
  const b = await pagePoint(page, 300, 122);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => objectCount(page)).toBeGreaterThan(0);
  const highlights = await objectCount(page);

  await page.keyboard.press("r");
  const c = await pagePoint(page, 100, 300);
  const e = await pagePoint(page, 250, 380);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(e.x, e.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => objectCount(page)).toBe(highlights + 1);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => objectCount(page)).toBe(highlights);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => objectCount(page)).toBe(highlights + 1);
  // Redo clears the selection; select the rectangle by clicking its centre, then delete it.
  const mid = await pagePoint(page, 175, 340);
  await page.mouse.click(mid.x, mid.y);
  await page.keyboard.press("Delete");
  await expect.poll(() => objectCount(page)).toBe(highlights);
});

test("redaction permanently removes the underlying text", async ({ page }) => {
  await openInEditor(page);
  await page.keyboard.press("d");
  // "Confidential: account number 4401-2290-1187." at y≈159pt
  const a = await pagePoint(page, 60, 160);
  const b = await pagePoint(page, 320, 160);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  const text = await pdfText(await downloadBytes(await saveAndDownload(page)));
  expect(text[0]).not.toContain("4401-2290-1187");
  expect(text[0]).toContain("Service Agreement"); // the rest stays searchable
  expect(text[1]).toContain("4401-2290-1187");    // other pages untouched
});

test("page management: delete, rotate and undo from the thumbnail sidebar", async ({ page }) => {
  await openInEditor(page);
  await page.getByRole("option", { name: /Page 2/ }).click();
  await page.getByRole("button", { name: "Delete selected pages" }).click();
  await expect(page.locator("[data-page-index]")).toHaveCount(2);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("[data-page-index]")).toHaveCount(3);
  await page.getByRole("option", { name: /Page 1/ }).click();
  await page.getByRole("button", { name: "Rotate selected pages right" }).click();
  const text = await pdfText(await downloadBytes(await saveAndDownload(page)));
  expect(text).toHaveLength(3);
});

test("typed signature can be placed and exported", async ({ page }) => {
  await openInEditor(page);
  await page.keyboard.press("s");
  await page.getByLabel("Your name").fill("Alex Morgan");
  await page.getByRole("button", { name: "Use signature" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Click on a page" })).toBeVisible();
  const p = await pagePoint(page, 300, 500);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => objectCount(page)).toBe(1);
  const bytes = await downloadBytes(await saveAndDownload(page));
  expect(new TextDecoder("latin1").decode(bytes)).toContain("/Image");
});

test("auto-save offers to restore after a reload", async ({ page }) => {
  await openInEditor(page);
  await page.keyboard.press("x"); // eraser (no-op), then add a star so there is something to save
  await page.keyboard.press("Escape");
  await page.keyboard.press("r");
  const a = await pagePoint(page, 100, 300);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 80, a.y + 60, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(1800); // debounce
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await expect(page.getByText("Restore your previous document?")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect.poll(() => objectCount(page)).toBe(1);
});

test("keyboard shortcut panel opens with ?", async ({ page }) => {
  await openInEditor(page);
  await page.keyboard.press("Shift+?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
});

test("existing form fields can be filled and are saved into the PDF", async ({ page }) => {
  await openInEditor(page, "form.pdf");
  await expect(page.getByText(/Form fields · 3/)).toBeVisible();
  await page.getByLabel("full_name").fill("Prabeen Bhattarai");
  await page.getByLabel("country").selectOption("Nepal");
  const d = await saveAndDownload(page);
  const form = (await PDFDocument.load(await downloadBytes(d))).getForm();
  expect(form.getTextField("full_name").getText()).toBe("Prabeen Bhattarai");
  expect(form.getDropdown("country").getSelected()).toEqual(["Nepal"]);
});
