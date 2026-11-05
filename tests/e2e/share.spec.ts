import { test, expect } from "@playwright/test";
import { PDFDocument, PDFName, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState } from "pdf-lib";
import { fixturePath, downloadBytes, openInEditor, pdfText } from "./helpers";

async function createLink(page: import("@playwright/test").Page, password = "") {
  await page.goto("/share-pdf");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  if (password) await page.getByLabel("Password (optional)").fill(password);
  await page.getByRole("button", { name: "Create link" }).click();
  return page.getByTestId("share-url").inputValue();
}

test("a recipient opens a link and downloads the same PDF, and the server never sees the key", async ({ page, browser }) => {
  const sent: string[] = [];
  page.on("request", (r) => sent.push(r.url() + " " + (r.postData() ?? "")));
  const link = await createLink(page);
  expect(link).toMatch(/\/s\/[0-9a-f]{32}#k=/);
  const secret = link.split("#k=")[1];
  expect(sent.join("\n")).not.toContain(secret);
  expect(sent.join("\n")).not.toContain("sample.pdf");

  const other = await (await browser.newContext()).newPage();
  const seen: string[] = [];
  other.on("request", (r) => seen.push(r.url() + " " + (r.postData() ?? "")));
  await other.goto(link);
  await expect(other.getByTestId("shared-name")).toHaveText("sample.pdf");
  const [d] = await Promise.all([other.waitForEvent("download"), other.getByTestId("shared-download").click()]);
  expect(d.suggestedFilename()).toBe("sample.pdf");
  expect((await pdfText(await downloadBytes(d)))[0]).toContain("Page 1");
  expect(seen.join("\n")).not.toContain(secret);
  expect(seen.filter((u) => u.includes("/ingest"))).toEqual([]);
  await expect(other.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("a password is required and a wrong one is refused", async ({ page, browser }) => {
  const link = await createLink(page, "open sesame");
  const other = await (await browser.newContext()).newPage();
  await other.goto(link);
  await other.getByLabel("Password").fill("wrong");
  await other.getByRole("button", { name: "Unlock" }).click();
  await expect(other.getByText("That password isn't right")).toBeVisible();
  await other.getByLabel("Password").fill("open sesame");
  await other.getByRole("button", { name: "Unlock" }).click();
  await expect(other.getByTestId("shared-name")).toHaveText("sample.pdf");
});

test("a link missing its key, or a deleted link, explains itself", async ({ page }) => {
  const link = await createLink(page);
  await page.goto(link.split("#")[0]);
  await expect(page.getByRole("heading", { name: "This link is incomplete" })).toBeVisible();

  await page.goto("/share-pdf");
  await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
  const id = link.match(/\/s\/([0-9a-f]{32})/)![1];
  const row = page.locator(`[data-share-id="${id}"]`);
  await expect(row).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Delete link" }).click();
  await expect(row).toHaveCount(0);
  await page.goto(`/s/${id}#k=whatever`);
  await expect(page.getByRole("heading", { name: "This link is no longer available" })).toBeVisible();
});

test("a file can be reported", async ({ page }) => {
  const link = await createLink(page);
  await page.goto(link);
  await page.getByRole("button", { name: "Report this file" }).click();
  await page.getByLabel("What's the problem?").selectOption("phishing");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Thanks for reporting this")).toBeVisible();
});

test("the API refuses bad requests and unknown links", async ({ request }) => {
  expect((await request.get("/api/share/not-a-real-id")).status()).toBe(404);
  expect((await request.get(`/api/share/${"0".repeat(32)}`)).status()).toBe(404);
  const big = await request.post("/api/share", { data: { size: 2e9, days: 7, nameCt: "abc" } });
  expect(big.status()).toBe(413);
  const days = await request.post("/api/share", { data: { size: 10, days: 365, nameCt: "abc" } });
  expect(days.status()).toBe(400);
});

test("share the current document from the editor", async ({ page }) => {
  await openInEditor(page);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Share a link" }).click();
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByTestId("share-url")).toHaveValue(/\/s\/[0-9a-f]{32}#k=/);
});

test("save the open document as a template", async ({ page }) => {
  await openInEditor(page);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Save as template" }).click();
  await expect(page.getByText("Saved as a template")).toBeVisible();
  await page.goto("/pdf-templates");
  await expect(page.getByTestId("template-row")).toContainText("sample.pdf");
});

/** A real PDF over the 5 MB limit: one large noisy image that Flate can't shrink but JPEG can. */
async function bigPdf() {
  const width = 2000, height = 2000;
  const raw = new Uint8Array(width * height * 3);
  for (let i = 0, x = 1; i < raw.length; i++) { x = (x * 1664525 + 1013904223) >>> 0; raw[i] = x >>> 24; }
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 600]);
  const image = doc.context.flateStream(raw, { Type: "XObject", Subtype: "Image", Width: width, Height: height, ColorSpace: "DeviceRGB", BitsPerComponent: 8 });
  page.node.setXObject(PDFName.of("Im0"), doc.context.register(image));
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(600, 0, 0, 600, 0, 0), drawObject("Im0"), popGraphicsState());
  return Buffer.from(await doc.save());
}

test("a file over 5 MB must be compressed, with a before and after preview", async ({ page }) => {
  const buffer = await bigPdf();
  expect(buffer.length).toBeGreaterThan(5 * 1024 * 1024);
  await page.goto("/share-pdf");
  await page.getByTestId("file-input").setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer });
  await expect(page.getByTestId("share-too-big")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create link" })).toBeDisabled();

  await page.getByRole("radio", { name: "High compression" }).click();
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  await expect(page.getByTestId("compress-result")).toContainText("smaller", { timeout: 60_000 });
  await expect(page.getByTestId("compress-preview").locator("img")).toHaveCount(2);
  await expect(page.getByRole("radio", { name: "Share compressed" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Create link" })).toBeEnabled();

  // Choosing the original puts the limit back.
  await page.getByRole("radio", { name: /Share original/ }).click();
  await expect(page.getByRole("button", { name: "Create link" })).toBeDisabled();
  await page.getByRole("radio", { name: "Share compressed" }).click();
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByTestId("share-url")).toHaveValue(/\/s\/[0-9a-f]{32}#k=/);
});

test("the server refuses anything over 5 MB, whatever the browser says", async ({ request }) => {
  const res = await request.post("/api/share", { data: { size: 5 * 1024 * 1024 + 65, days: 7, nameCt: "abc" } });
  expect(res.status()).toBe(413);
});

test("share, crop and bookmarks are on the editor's top bar", async ({ page }) => {
  await openInEditor(page);
  await page.getByTestId("share").click();
  await expect(page.getByRole("dialog")).toContainText("Share a link");
  await expect(page.getByTestId("share-size")).toContainText("File size");
  await page.keyboard.press("Escape");

  // Add a bookmark in the editor and check it's in the download, pointing at the right page after a reorder.
  await page.getByRole("button", { name: "Edit bookmarks" }).click();
  await page.getByRole("button", { name: "Add bookmark" }).click();
  await page.getByLabel("Bookmark 1 title").fill("Third page");
  await page.getByLabel("Bookmark 1 page").fill("3");
  await page.getByRole("button", { name: "Save bookmarks" }).click();
  // Deleting the first page moves the third page up, and the bookmark should follow it.
  await page.getByRole("option", { name: /Page 1/ }).click();
  await page.getByRole("button", { name: "Delete selected pages" }).click();
  await expect(page.locator("[data-page-index]")).toHaveCount(2);
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: (await downloadBytes(d)).slice(), isEvalSupported: false }).promise;
  const [outline] = await doc.getOutline();
  expect(outline.title).toBe("Third page");
  expect(await doc.getPageIndex((outline.dest as unknown[])[0] as never)).toBe(1);
  await doc.destroy();
});

test("crop in the editor changes the page, and Undo restores it", async ({ page }) => {
  await openInEditor(page);
  // Pages fit the window's width, so the crop shows up as a change in shape.
  const shape = async () => {
    const box = (await page.locator('[data-page-index="0"]').boundingBox())!;
    return box.height / box.width;
  };
  const before = await shape();
  await page.getByRole("button", { name: "Crop pages" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("crop-page").locator("img")).toBeVisible();
  await dialog.getByLabel("Left margin (%)").fill("25");
  await dialog.getByRole("button", { name: "Crop PDF" }).click();
  await expect(page.getByText("Pages cropped")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(shape).toBeCloseTo(before / 0.75, 1);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(shape).toBeCloseTo(before, 1);
});
