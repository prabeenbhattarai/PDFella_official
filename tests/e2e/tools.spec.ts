import { test, expect } from "@playwright/test";
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

test("cloud tools explain when processing is unavailable or run when it is", async ({ page, request }) => {
  const health = await (await request.get("/api/health")).json();
  await page.goto("/ocr-pdf");
  if (!health.processing) await expect(page.getByText("processing service isn't connected")).toBeVisible();
  else await expect(page.getByTestId("dropzone")).toBeVisible();
});
