import { test, expect } from "@playwright/test";
import { openInEditor, pagePoint, saveAndDownload, downloadBytes, pdfText, fixturePath, objectCount } from "./helpers";

test("tool rail shows a text label for every tool and explains groups", async ({ page }) => {
  await openInEditor(page);
  const rail = page.getByRole("toolbar", { name: "Tools" }).first();
  for (const label of ["Select", "Edit text", "Add text", "Whiteout", "Markup", "Draw", "Shapes", "Image", "Sign", "Stamps", "Comment", "Redact"]) {
    await expect(rail.getByText(label, { exact: true })).toBeVisible();
  }
  await rail.getByRole("button", { name: /Highlight/ }).click();
  const menu = page.getByRole("menu", { name: "Markup" });
  await expect(menu.getByText("Drag across text to highlight it")).toBeVisible();
  await menu.getByRole("menuitem", { name: /Underline/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Underline:" })).toBeVisible();
});

test("double-clicking PDF text with the Select tool edits the whole line in place", async ({ page }) => {
  await openInEditor(page);
  const p = await pagePoint(page, 120, 142); // "Payment terms: 60 days from the date of invoice."
  await page.mouse.dblclick(p.x, p.y);
  const box = page.getByRole("textbox", { name: "Text" });
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("Payment terms: 60 days from the date of invoice.");
  await box.fill("Payment terms: 14 days from the date of invoice.");
  await page.keyboard.press("Escape");
  const text = await pdfText(await downloadBytes(await saveAndDownload(page)));
  expect(text[0]).toContain("14 days");
  expect(text[0]).not.toContain("60 days");
});

test("double-click selects just that word, even when every word is a separate run", async ({ page }) => {
  await openInEditor(page, "words.pdf");
  // "1,250" spans x≈162–192pt on the 700pt baseline (≈142pt from the top).
  const p = await pagePoint(page, 175, 137);
  await page.mouse.dblclick(p.x, p.y);
  const box = page.getByRole("textbox", { name: "Text" });
  await expect(box).toHaveValue("The invoice total is 1,250 USD payable today.");
  const selected = await box.evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd));
  expect(selected).toBe("1,250");
  await page.keyboard.type("990");
  await page.keyboard.press("Escape");
  const [text] = await pdfText(await downloadBytes(await saveAndDownload(page)));
  expect(text).toContain("The invoice total is 990 USD payable today.");
  expect(text).not.toContain("1,250");
  expect(text).toContain("Second column text");
});

test("a PDF with an open password asks once, then is fully editable", async ({ page }) => {
  await page.goto("/editor");
  await page.getByTestId("file-input").setInputFiles(fixturePath("locked-open.pdf"));
  const dialog = page.getByRole("dialog", { name: "This PDF is password protected" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("PDF password").fill("wrong");
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await expect(dialog.getByText("isn't right")).toBeVisible();
  await dialog.getByLabel("PDF password").fill("open-sesame");
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator("[data-page-index]")).toHaveCount(3);
  await page.keyboard.press("r");
  const a = await pagePoint(page, 100, 300);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x + 80, a.y + 50, { steps: 3 }); await page.mouse.up();
  await expect.poll(() => objectCount(page)).toBe(1);
  const bytes = await downloadBytes(await saveAndDownload(page));
  expect(new TextDecoder("latin1").decode(bytes)).not.toContain("/Encrypt");
});

test("a PDF that only restricts editing opens without any prompt", async ({ page }) => {
  await page.goto("/editor");
  await page.getByTestId("file-input").setInputFiles(fixturePath("locked-owner.pdf"));
  await expect(page.locator("[data-page-index]")).toHaveCount(3);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const text = await pdfText(await downloadBytes(await saveAndDownload(page)));
  expect(text).toHaveLength(3);
});

test("tools accept protected PDFs (merge) and Unlock/Protect run in the browser", async ({ page }) => {
  await page.goto("/merge-pdf");
  await page.getByTestId("file-input").first().setInputFiles([fixturePath("locked-owner.pdf"), fixturePath("form.pdf")]);
  await page.getByRole("button", { name: "Merge 2 PDFs" }).click();
  const [m] = await Promise.all([page.waitForEvent("download"), page.getByTestId("tool-download").click()]);
  expect(await pdfText(await downloadBytes(m))).toHaveLength(4);

  await page.goto("/unlock-pdf");
  await expect(page.getByText("Runs in your browser").first()).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(fixturePath("locked-owner.pdf"));
  await expect(page.getByText("Password and restrictions removed")).toBeVisible();

  await page.goto("/protect-pdf");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  await page.getByLabel("Password", { exact: true }).fill("tst-1234");
  await page.getByLabel("Confirm password").fill("tst-1234");
  await page.getByRole("button", { name: "Protect PDF" }).click();
  const [p] = await Promise.all([page.waitForEvent("download"), page.getByTestId("tool-download").click()]);
  expect(new TextDecoder("latin1").decode(await downloadBytes(p))).toContain("/Encrypt");
});
