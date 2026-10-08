import { expect, type Page, type Download } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

export const FIXTURES = path.join(__dirname, "..", "fixtures");
export const fixturePath = (n: string) => path.join(FIXTURES, n);

export async function openInEditor(page: Page, file = "sample.pdf") {
  await page.goto("/editor");
  await page.getByTestId("file-input").setInputFiles(path.isAbsolute(file) ? file : fixturePath(file));
  await expect(page.getByTestId("editor")).toBeVisible();
  await expect(page.locator("[data-page-index]").first()).toBeVisible();
  // Wait for fit-to-width zoom to settle so page coordinates are stable.
  let last = -1;
  await expect.poll(async () => {
    const w = (await page.locator('[data-page-index="0"]').boundingBox())?.width ?? 0;
    const stable = w > 0 && w === last;
    last = w;
    return stable;
  }, { intervals: [300] }).toBe(true);
}

/** Number of editor objects currently on all pages (read from the DOM). */
export const objectCount = (page: Page) => page.locator("[data-page-layer] > [data-obj-id]").count();

export async function downloadBytes(d: Download): Promise<Uint8Array> {
  const p = await d.path();
  return new Uint8Array(readFileSync(p!));
}

export async function pdfText(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map((t) => ("str" in t ? t.str : "")).join(" "));
  }
  await doc.destroy();
  return out;
}

/** Point on page 1 in page coordinates (points) → screen position. */
export async function pagePoint(page: Page, x: number, y: number, index = 0) {
  const box = (await page.locator(`[data-page-index="${index}"]`).boundingBox())!;
  const zoom = box.width / 595.28; // fixtures are A4 portrait
  return { x: box.x + x * zoom, y: box.y + y * zoom };
}

export async function saveAndDownload(page: Page, name?: string) {
  await page.getByTestId("save").click();
  // Documents with forms or redactions show an options step first.
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Save", exact: true });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.getByTestId("save-ready")).toBeVisible();
  if (name) await page.getByLabel("File name").fill(name);
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-pdf").click()]);
  return d;
}

/** Real names of the fonts used to draw text containing `needle` on page 1. */
export async function pdfFontsFor(bytes: Uint8Array, needle: string): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, fontExtraProperties: true }).promise;
  const page = await doc.getPage(1);
  await page.getOperatorList();
  const tc = await page.getTextContent();
  const names = new Set<string>();
  for (const it of tc.items) {
    if (!("str" in it) || !it.str.trim() || !needle.includes(it.str.trim().split(" ")[0])) continue;
    const f = page.commonObjs.get(it.fontName) as { name?: string } | undefined;
    names.add((f?.name ?? it.fontName).replace(/^[A-Z]{6}\+/, ""));
  }
  await doc.destroy();
  return [...names];
}
