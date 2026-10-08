import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { openInEditor, pagePoint, saveAndDownload, downloadBytes, pdfText } from "./helpers";

const panel = (page: Page) => page.locator("[data-stamp-maker], [data-whiteout-mode]").filter({ visible: true }).first().locator("xpath=ancestor::section[1]");
const AGREEMENT = path.join(__dirname, "..", "..", "public", "samples", "agreement.pdf");

test("make a custom stamp with its own text, text colour and outline", async ({ page }) => {
  await openInEditor(page);
  const rail = page.getByRole("toolbar", { name: "Tools" }).first();
  await rail.getByRole("button", { name: /Stamp/ }).first().click();
  await page.getByRole("menuitem", { name: /^Stamp/ }).first().click();
  const p = panel(page);
  await p.getByLabel("Stamp text").fill("Checked by Ana");
  await p.getByRole("group", { name: "Text colour" }).getByRole("button", { name: /Colour #/ }).nth(5).click();
  await p.getByRole("group", { name: "Outline colour" }).getByRole("button", { name: "No colour" }).click();
  await p.getByRole("button", { name: "Save to my stamps" }).click();
  await expect(p.getByRole("button", { name: "Use stamp Checked by Ana" })).toBeVisible();

  const at = await pagePoint(page, 300, 450);
  await page.mouse.click(at.x, at.y);
  const stamp = page.locator('[data-kind="stamp"]');
  await expect(stamp).toHaveCount(1);
  await expect(stamp).toContainText("Checked by Ana");
  await expect(stamp.locator("path")).toHaveCount(0); // no outline

  const [text] = await pdfText(await downloadBytes(await saveAndDownload(page)));
  expect(text).toContain("Checked by Ana");
});

test("text-only whiteout removes the text but keeps the image under it", async ({ page }) => {
  await openInEditor(page, AGREEMENT);
  await page.keyboard.press("w");
  await panel(page).getByRole("radio", { name: "Text only" }).click();
  // Caption "Moodboard — palette and imagery" sits on a green image block (baseline 390pt from the top).
  const a = await pagePoint(page, 66, 380), b = await pagePoint(page, 240, 394);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
  await expect(page.locator('[data-kind="whiteout"]')).toHaveCount(1);

  // The preview re-renders without the caption: no white box, the green shows through.
  await expect.poll(() => page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-page-index="0"] canvas')!;
    const s = c.width / 595.28;
    const d = c.getContext("2d")!.getImageData(Math.round(74 * s), Math.round(384 * s), Math.round(120 * s), Math.round(8 * s)).data;
    let light = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) light++;
    return light;
  }), { timeout: 10_000 }).toBe(0);
  await expect(page.locator('[data-kind="whiteout"] > div')).toHaveCount(0);

  const [text] = await pdfText(await downloadBytes(await saveAndDownload(page)));
  expect(text).not.toContain("Moodboard");
  expect(text).toContain("Service Agreement");
});

test("cover-all whiteout still paints a solid box", async ({ page }) => {
  await openInEditor(page);
  await page.keyboard.press("w");
  await expect(panel(page).getByRole("radio", { name: "Cover everything" })).toHaveAttribute("aria-checked", "true");
  const a = await pagePoint(page, 300, 400), b = await pagePoint(page, 400, 440);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
  await expect(page.locator('[data-kind="whiteout"] > div')).toHaveCount(1);
});
