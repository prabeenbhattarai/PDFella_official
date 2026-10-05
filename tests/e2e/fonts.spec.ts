import { test, expect } from "@playwright/test";
import { type Page } from "@playwright/test";
import { openInEditor, pagePoint, saveAndDownload, downloadBytes, pdfText, pdfFontsFor } from "./helpers";

/** The properties panel exists twice (desktop sidebar + mobile sheet); use the visible one. */
const visible = (page: Page, sel: string) => page.locator(sel).filter({ visible: true });
const flat = (s: string) => s.replace(/\s+/g, " ");

// tests/fixtures/fonts.pdf (A4): baselines are 121.9pt (Carlito Bold 16pt), 161.9pt
// (EB Garamond Italic 13pt) and 201.9pt (standard Courier 11pt, not embedded) from the top.

test("edited text reuses the PDF's own embedded font, weight, size and colour", async ({ page }) => {
  await openInEditor(page, "fonts.pdf");
  const p = await pagePoint(page, 100, 116);
  await page.mouse.dblclick(p.x, p.y);
  const box = page.getByRole("textbox", { name: "Text" });
  await expect(box).toHaveValue("Quarterly report for Northwind");
  await expect(page.getByText("Exact font, reused from this PDF").filter({ visible: true })).toBeVisible();
  await expect(visible(page, "[data-original-style]")).toContainText("Carlito Bold");
  await expect(visible(page, "[data-original-style]")).toContainText("16 pt");
  await expect(page.getByLabel("Font size").filter({ visible: true })).toHaveValue("16");

  // "T" and "s" aren't in the embedded subset: they fall back to the metric twin, silently.
  await box.fill("Quarterly report for Northwind Traders");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Text style differs from the original" })).toHaveCount(0);

  const bytes = await downloadBytes(await saveAndDownload(page));
  expect(flat((await pdfText(bytes))[0])).toContain("Quarterly report for Northwind Traders");
  const fonts = await pdfFontsFor(bytes, "Quarterly report for Northwind Traders");
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.every((f) => /Carlito/i.test(f))).toBe(true);
});

test("changing the look of edited text asks: use the original style or keep the new one", async ({ page }) => {
  await openInEditor(page, "fonts.pdf");
  const p = await pagePoint(page, 100, 157);
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.getByRole("textbox", { name: "Text" })).toHaveValue("Prepared by the finance team");
  await expect(visible(page, "[data-original-style]")).toContainText("EB Garamond Italic");
  await page.keyboard.press("Escape");

  const size = page.getByLabel("Font size").filter({ visible: true });
  await size.fill("20");
  const prompt = page.getByRole("dialog", { name: "Text style differs from the original" });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("Size:");
  await expect(prompt).toContainText("13 pt");
  await prompt.getByRole("button", { name: "Use original style" }).click();
  await expect(prompt).toHaveCount(0);
  await expect(size).toHaveValue("13");

  // Pick a different font: asked again; keeping it sticks without asking twice.
  await page.getByRole("button", { name: "Font", exact: true }).filter({ visible: true }).click();
  await page.getByLabel("Search fonts").fill("lobster");
  await page.getByRole("option", { name: /Lobster/ }).click();
  await expect(prompt).toContainText("Font:");
  await prompt.getByRole("button", { name: "Keep new style" }).click();
  await expect(prompt).toHaveCount(0);
  await size.fill("15");
  await expect(prompt).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Match original" }).filter({ visible: true }).first()).toBeVisible();

  const bytes = await downloadBytes(await saveAndDownload(page));
  expect(flat((await pdfText(bytes))[0])).toContain("Prepared by the finance team"); // Lobster is wider: wraps to 2 lines
  expect((await pdfFontsFor(bytes, "Prepared by the finance team")).some((f) => /Lobster/i.test(f))).toBe(true);
});

test("text in a standard, non-embedded font is matched to that font", async ({ page }) => {
  await openInEditor(page, "fonts.pdf");
  const p = await pagePoint(page, 100, 198);
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.getByRole("textbox", { name: "Text" })).toHaveValue("Contact the office today");
  await expect(page.getByText("Same design and letter widths").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Font", exact: true }).filter({ visible: true })).toHaveText("Courier");
});

test("objects are easy to pick: same-tool click selects, rubber-band selects many, quick actions", async ({ page }) => {
  await openInEditor(page);
  // Whiteout is a sticky tool; clicking the whiteout just drawn selects it instead of drawing another.
  await page.keyboard.press("w");
  const a = await pagePoint(page, 300, 400), b = await pagePoint(page, 420, 440);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
  await expect(page.locator('[data-kind="whiteout"]')).toHaveCount(1);
  const mid = await pagePoint(page, 360, 420);
  await page.mouse.click(mid.x, mid.y);
  await expect(page.locator('[data-kind="whiteout"]')).toHaveCount(1);
  await expect(page.locator("[data-handle]").first()).toBeVisible();
  const before = await page.locator('[data-kind="whiteout"]').boundingBox();
  await page.mouse.move(mid.x, mid.y); await page.mouse.down(); await page.mouse.move(mid.x + 60, mid.y + 30, { steps: 6 }); await page.mouse.up();
  const after = await page.locator('[data-kind="whiteout"]').boundingBox();
  expect(after!.x - before!.x).toBeGreaterThan(40);

  // A rectangle elsewhere, then drag a selection box around both.
  await page.keyboard.press("r");
  const c = await pagePoint(page, 120, 250), d = await pagePoint(page, 200, 300);
  await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(d.x, d.y, { steps: 5 }); await page.mouse.up();
  await page.keyboard.press("Escape");
  await page.keyboard.press("v");
  const m1 = await pagePoint(page, 80, 225), m2 = await pagePoint(page, 520, 480);
  await page.mouse.move(m1.x, m1.y); await page.mouse.down(); await page.mouse.move(m2.x, m2.y, { steps: 8 }); await page.mouse.up();
  await expect(page.getByText("2 objects selected").filter({ visible: true })).toBeVisible();
  const actions = page.getByRole("toolbar", { name: "Selection actions" });
  await expect(actions).toBeVisible();
  await actions.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator('[data-kind="whiteout"], [data-kind="rect"]')).toHaveCount(0);
});

test("clicking selected text again starts editing it", async ({ page }) => {
  await openInEditor(page);
  await page.keyboard.press("t");
  const p = await pagePoint(page, 100, 420);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.type("Approved by Sam");
  await page.keyboard.press("Escape");
  const text = page.locator('[data-kind="text"]');
  await page.keyboard.press("Escape"); // deselect
  const tb = (await text.boundingBox())!;
  await page.mouse.click(tb.x + tb.width / 3, tb.y + tb.height / 2);
  await expect(page.getByRole("toolbar", { name: "Selection actions" })).toBeVisible();
  await page.mouse.click(tb.x + tb.width / 3, tb.y + tb.height / 2);
  await expect(page.getByRole("textbox", { name: "Text" })).toBeFocused();
});
