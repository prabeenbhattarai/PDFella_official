import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { fixturePath, downloadBytes, pdfText } from "./helpers";

test("merge two PDFs", async ({ page }) => {
  await page.goto("/merge-pdf");
  await page.getByTestId("file-input").first().setInputFiles([fixturePath("sample.pdf"), fixturePath("form.pdf")]);
  await page.getByRole("button", { name: "Merge 2 PDFs" }).click();
  await expect(page.getByTestId("tool-result")).toBeVisible();
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("tool-download").click()]);
  expect(await pdfText(await downloadBytes(d))).toHaveLength(4);
});

test("split every page into a ZIP", async ({ page }) => {
  await page.goto("/split-pdf");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  await page.getByRole("radio", { name: "Fixed size" }).click();
  await page.getByRole("button", { name: "Split PDF" }).click();
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("tool-download").click()]);
  expect(d.suggestedFilename()).toMatch(/\.zip$/);
});

test("compress reports sizes", async ({ page }) => {
  await page.goto("/compress-pdf");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  await page.getByRole("button", { name: "Compress PDF" }).click();
  await expect(page.getByTestId("tool-result")).toBeVisible();
});

test("delete pages", async ({ page }) => {
  await page.goto("/delete-pdf-pages");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  await page.getByRole("option").nth(1).click();
  await page.getByRole("button", { name: "Delete 1 page" }).click();
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("tool-download").click()]);
  const text = await pdfText(await downloadBytes(d));
  expect(text).toHaveLength(2);
  expect(text.join(" ")).not.toContain("Page 2");
});

test("watermark and page numbers", async ({ page }) => {
  await page.goto("/add-page-numbers-to-pdf");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  await page.getByRole("button", { name: "Add page numbers" }).click();
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("tool-download").click()]);
  expect((await pdfText(await downloadBytes(d)))[2]).toContain("3");
});

test("PDF to text", async ({ page }) => {
  await page.goto("/pdf-to-text");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  await page.getByRole("button", { name: "Extract text" }).click();
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("tool-download").click()]);
  expect(d.suggestedFilename()).toBe("sample.txt");
});

test("tools that need the processing server are tagged Coming soon, and keep their pages", async ({ page }) => {
  await page.goto("/ocr-pdf");
  await expect(page.getByTestId("coming-soon")).toHaveText("Coming soon");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Related tools" })).toBeVisible();

  await page.goto("/");
  await expect(page.locator('#tools a[href="/word-to-pdf"]').filter({ hasText: "Coming soon" })).toBeVisible();
  await expect(page.locator('#tools a[href="/merge-pdf"]').filter({ hasText: "Coming soon" })).toHaveCount(0);

  // Tools that run in the browser have no tag.
  await page.goto("/pdf-to-word");
  await expect(page.getByTestId("coming-soon")).toHaveCount(0);
  await expect(page.getByTestId("file-input").first()).toBeAttached();

  // General uploads don't offer Office files.
  await page.goto("/editor");
  expect(await page.getByTestId("file-input").first().getAttribute("accept")).not.toContain("docx");
});

test("crop by dragging the box, on one page only", async ({ page }) => {
  await page.goto("/crop-pdf");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  const area = page.getByTestId("crop-page");
  await expect(area.locator("img")).toBeVisible();
  const box = (await area.boundingBox())!;
  const handle = (await page.locator('[data-handle="left"]').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const left = Number(await page.getByLabel("Left margin (%)").inputValue());
  expect(left).toBeGreaterThan(20);
  expect(left).toBeLessThan(30);

  await page.getByRole("radio", { name: "This page only" }).click();
  await page.getByRole("button", { name: "Crop PDF" }).click();
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("tool-download").click()]);
  const doc = await PDFDocument.load(await downloadBytes(d));
  expect(doc.getPage(0).getCropBox().width).toBeLessThan(doc.getPage(1).getCropBox().width * 0.8);
});

test("add and nest bookmarks", async ({ page }) => {
  await page.goto("/pdf-bookmarks");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  await expect(page.getByText("has no bookmarks yet")).toBeVisible();
  await page.getByRole("button", { name: "Add bookmark" }).click();
  await page.getByLabel("Bookmark 1 title").fill("Intro");
  await page.getByRole("button", { name: "Add bookmark" }).click();
  await page.getByLabel("Bookmark 2 title").fill("Details");
  await page.getByLabel("Bookmark 2 page").fill("3");
  await page.getByRole("button", { name: "Nest bookmark 2" }).click();
  await page.getByRole("button", { name: "Save bookmarks" }).click();
  await expect(page.getByTestId("tool-result")).toBeVisible();
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("tool-download").click()]);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: (await downloadBytes(d)).slice(), isEvalSupported: false }).promise;
  const outline = await doc.getOutline();
  expect(outline.map((n) => n.title)).toEqual(["Intro"]);
  expect(outline[0].items.map((n) => n.title)).toEqual(["Details"]);
  await doc.destroy();
});

test("edit and remove file details", async ({ page }) => {
  await page.goto("/pdf-metadata");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  await page.getByLabel("Title").fill("Quarterly report");
  await page.getByRole("button", { name: "Save details" }).click();
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("tool-download").click()]);
  expect((await PDFDocument.load(await downloadBytes(d))).getTitle()).toBe("Quarterly report");

  await page.getByRole("button", { name: /Start over/ }).click();
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  await page.getByRole("button", { name: "Remove all details" }).click();
  await expect(page.getByLabel("Title")).toHaveValue("");
  await page.getByRole("button", { name: "Save details" }).click();
  const [e] = await Promise.all([page.waitForEvent("download"), page.getByTestId("tool-download").click()]);
  const clean = await PDFDocument.load(await downloadBytes(e), { updateMetadata: false });
  expect(clean.getProducer()).toBeUndefined();
  expect(clean.getCreationDate()).toBeUndefined();
});

test("save a template, then fill it from a spreadsheet", async ({ page }) => {
  const form = await PDFDocument.load(readFileSync(fixturePath("form.pdf")));
  const field = form.getForm().getFields().find((f) => f.constructor.name === "PDFTextField")!.getName();

  await page.goto("/pdf-templates");
  await page.getByTestId("file-input").setInputFiles(fixturePath("form.pdf"));
  const row = page.getByTestId("template-row");
  await expect(row).toContainText("form.pdf");
  await row.getByRole("button", { name: "From spreadsheet" }).click();

  await page.waitForURL(/fill-pdf-from-spreadsheet/);
  await page.getByTestId("sheet-input").setInputFiles({ name: "people.csv", mimeType: "text/csv", buffer: Buffer.from(`${field},who\nAsha,first\nBo,second\n`) });
  await expect(page.getByLabel(`Column for ${field}`)).toHaveValue("0");
  await page.getByLabel("Name each file from").selectOption({ label: "who" });
  await page.getByRole("button", { name: "Create 2 PDFs" }).click();
  await expect(page.getByTestId("tool-result")).toBeVisible();
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("tool-download").click()]);
  const zip = await JSZip.loadAsync(await downloadBytes(d));
  expect(Object.keys(zip.files).sort()).toEqual(["first.pdf", "second.pdf"]);
  const filled = await PDFDocument.load(await zip.files["second.pdf"].async("uint8array"));
  expect(filled.getForm().getTextField(field).getText()).toBe("Bo");

  // The template is still there to use again, and can be deleted.
  await page.goto("/pdf-templates");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete form.pdf" }).click();
  await expect(page.getByTestId("template-row")).toHaveCount(0);
});

test("a PDF with no fields points to the form builder", async ({ page }) => {
  await page.goto("/fill-pdf-from-spreadsheet");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  await expect(page.getByText("This PDF has no fillable fields")).toBeVisible();
});
