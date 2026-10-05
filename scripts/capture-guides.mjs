/**
 * Captures the screenshots used in every tool's step-by-step tutorial by driving
 * the real app with Playwright. Output: public/guides/<slug>/<step>.jpg
 *
 *   BASE_URL=http://localhost:3100 node scripts/capture-guides.mjs [slug ...]
 *
 * Run against a production build. Cloud tools need the processing worker running;
 * when a result can't be produced (e.g. OCR without Tesseract installed), that step
 * is skipped and the tutorial shows the step without a screenshot.
 */
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = "public/guides";
const FX = (f) => path.resolve("tests/fixtures", f);
const SAMPLE = path.resolve("public/samples/agreement.pdf");
const only = process.argv.slice(2);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: "light" });
await ctx.addInitScript(() => {
  try { localStorage.setItem("theme", "light"); localStorage.setItem("pdfella.tip.dblclick", "1"); } catch { /* ignore */ }
});

const results = [];

/** Viewport screenshot (hero and editor steps). */
async function save(page, slug, n) {
  mkdirSync(`${OUT}/${slug}`, { recursive: true });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${slug}/${n}.jpg`, type: "jpeg", quality: 78, scale: "css" });
}

/** Tight, high-resolution crop around the tool's workspace card so its text is readable. */
async function saveCard(page, slug, n) {
  mkdirSync(`${OUT}/${slug}`, { recursive: true });
  await page.waitForTimeout(450);
  const card = page.locator("#top .rounded-3xl").first();
  await card.scrollIntoViewIfNeeded();
  const b = await card.boundingBox();
  const pad = 28;
  const dialog = await page.getByRole("dialog").first().boundingBox().catch(() => null);
  const box = dialog ?? b;
  const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 };
  await page.screenshot({ path: `${OUT}/${slug}/${n}.jpg`, type: "jpeg", quality: 80, clip });
}

async function pagePoint(page, x, y) {
  const box = await page.locator('[data-page-index="0"]').boundingBox();
  const z = box.width / 595.28;
  return { x: box.x + x * z, y: box.y + y * z };
}

async function drag(page, a, b) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

async function openEditorTool(page, slug, file = SAMPLE) {
  await page.goto(`${BASE}/${slug}`, { waitUntil: "networkidle" });
  await save(page, slug, 1);
  await page.getByTestId("file-input").first().setInputFiles(file);
  await page.waitForURL(/\/editor/);
  await page.locator('[data-page-index="0"]').waitFor();
  let last = -1;
  for (let i = 0; i < 20; i++) {
    const w = (await page.locator('[data-page-index="0"]').boundingBox())?.width ?? 0;
    if (w && w === last) break;
    last = w;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(800);
}

async function editorSave(page, slug) {
  await page.keyboard.press("Escape");
  await page.getByTestId("save").click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Save", exact: true });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.getByTestId("save-ready").waitFor({ timeout: 30_000 });
  await save(page, slug, 3);
}

/** Tool pages with an in-page workspace: upload → configure (shot 2) → act → result (shot 3). */
async function workspaceTool(page, slug, files, configure, act, opts = {}) {
  await page.goto(`${BASE}/${slug}`, { waitUntil: "networkidle" });
  await save(page, slug, 1);
  await page.getByTestId("file-input").first().setInputFiles(files);
  await page.waitForTimeout(1200);
  if (configure) await configure(page);
  if (!opts.skipShot2) await saveCard(page, slug, 2);
  if (act) await act(page);
  const ok = await page.getByTestId("tool-result").waitFor({ timeout: opts.timeout ?? 30_000 }).then(() => true).catch(() => false);
  if (ok) await saveCard(page, slug, 3);
  return ok;
}

const btn = (name) => async (page) => page.getByRole("button", { name, exact: true }).first().click();

const FLOWS = {
  // ── Editor-based tools
  "edit-pdf": async (p, s) => {
    await openEditorTool(p, s);
    const pt = await pagePoint(p, 164, 159);
    await p.mouse.dblclick(pt.x, pt.y);
    const box = p.getByRole("textbox", { name: "Text" });
    await box.waitFor();
    await p.keyboard.type("30");
    await save(p, s, 2);
    await editorSave(p, s);
  },
  "add-text-to-pdf": async (p, s) => {
    await openEditorTool(p, s);
    const pt = await pagePoint(p, 330, 545);
    await p.mouse.click(pt.x, pt.y);
    await p.getByRole("textbox", { name: "Text" }).waitFor();
    await p.keyboard.type("Approved by Alex Morgan");
    await save(p, s, 2);
    await editorSave(p, s);
  },
  "whiteout-pdf": async (p, s) => {
    await openEditorTool(p, s);
    await drag(p, await pagePoint(p, 58, 190), await pagePoint(p, 430, 212));
    await save(p, s, 2);
    await editorSave(p, s);
  },
  "highlight-pdf": async (p, s) => {
    await openEditorTool(p, s);
    await drag(p, await pagePoint(p, 60, 183), await pagePoint(p, 360, 183));
    await save(p, s, 2);
    await editorSave(p, s);
  },
  "draw-on-pdf": async (p, s) => {
    await openEditorTool(p, s);
    const o = await pagePoint(p, 320, 560);
    await p.mouse.move(o.x, o.y); await p.mouse.down();
    for (let i = 1; i <= 30; i++) await p.mouse.move(o.x + i * 6, o.y + Math.sin(i / 3) * 18, { steps: 2 });
    await p.mouse.up();
    await save(p, s, 2);
    await editorSave(p, s);
  },
  "annotate-pdf": async (p, s) => {
    await openEditorTool(p, s);
    const pt = await pagePoint(p, 420, 182);
    await p.mouse.click(pt.x, pt.y);
    const note = p.getByLabel("Comment", { exact: true }).first();
    await note.waitFor();
    await note.fill("Can we confirm the fee before signing?");
    await p.getByLabel("Author").first().fill("Alex");
    await save(p, s, 2);
    await editorSave(p, s);
  },
  "add-image-to-pdf": async (p, s) => {
    await p.goto(`${BASE}/${s}`, { waitUntil: "networkidle" });
    await save(p, s, 1);
    await p.getByTestId("file-input").first().setInputFiles(SAMPLE);
    await p.waitForURL(/\/editor/);
    await p.locator('[data-page-index="0"]').waitFor();
    await p.waitForTimeout(1500);
    await p.locator('input[aria-label="Choose image"]').setInputFiles(FX("guide/logo.png"));
    await p.waitForTimeout(500);
    const pt = await pagePoint(p, 420, 70);
    await p.mouse.click(pt.x, pt.y);
    await save(p, s, 2);
    await editorSave(p, s);
  },
  "add-shapes-to-pdf": async (p, s) => {
    await openEditorTool(p, s);
    await drag(p, await pagePoint(p, 330, 530), await pagePoint(p, 520, 610));
    await save(p, s, 2);
    await editorSave(p, s);
  },
  "sign-pdf": async (p, s) => {
    await openEditorTool(p, s);
    await p.getByLabel("Your name").fill("Alex Morgan");
    await p.waitForTimeout(400);
    await save(p, s, 2);
    await p.getByRole("button", { name: "Use signature" }).click();
    const pt = await pagePoint(p, 140, 466);
    await p.mouse.click(pt.x, pt.y);
    await editorSave(p, s);
  },
  "redact-pdf": async (p, s) => {
    await openEditorTool(p, s);
    await drag(p, await pagePoint(p, 160, 205), await pagePoint(p, 255, 205));
    await save(p, s, 2);
    await editorSave(p, s);
  },
  "fill-pdf": async (p, s) => {
    await openEditorTool(p, s, FX("form.pdf"));
    await p.getByLabel("full_name").fill("Alex Morgan");
    await p.getByLabel("country").selectOption("Nepal");
    await save(p, s, 2);
    await editorSave(p, s);
  },
  "create-pdf-form": async (p, s) => {
    await openEditorTool(p, s);
    await drag(p, await pagePoint(p, 330, 548), await pagePoint(p, 520, 572));
    await save(p, s, 2);
    await editorSave(p, s);
  },

  // ── Organise
  "merge-pdf": (p, s) => workspaceTool(p, s, [SAMPLE, FX("form.pdf"), FX("sample.pdf")], null, btn("Merge 3 PDFs")),
  "split-pdf": (p, s) => workspaceTool(p, s, SAMPLE, null, btn("Split PDF")).catch(() => false),
  "rotate-pdf": (p, s) => workspaceTool(p, s, FX("sample.pdf"), async (pg) => { await pg.getByRole("button", { name: /All right/ }).click(); }, btn("Apply rotation")),
  "rearrange-pdf-pages": (p, s) => workspaceTool(p, s, FX("sample.pdf"), async (pg) => { await pg.getByRole("option").nth(2).click(); await pg.getByRole("button", { name: "Duplicate" }).click(); }, btn("Save new order")),
  "delete-pdf-pages": (p, s) => workspaceTool(p, s, FX("sample.pdf"), async (pg) => { await pg.getByRole("option").nth(1).click(); }, async (pg) => pg.getByRole("button", { name: /^Delete 1 page/ }).click()),
  "extract-pdf-pages": (p, s) => workspaceTool(p, s, FX("sample.pdf"), async (pg) => { await pg.getByRole("option").nth(0).click(); await pg.getByRole("option").nth(2).click(); }, async (pg) => pg.getByRole("button", { name: /^Extract 2 pages/ }).click()),
  "add-page-numbers-to-pdf": (p, s) => workspaceTool(p, s, FX("sample.pdf"), async (pg) => { await pg.getByLabel("Format").selectOption("Page {page} of {pages}"); }, btn("Add page numbers")),
  "add-header-and-footer-to-pdf": (p, s) => workspaceTool(p, s, FX("sample.pdf"), null, btn("Apply")),

  // ── Convert (browser)
  "pdf-to-word": async (p, s) => {
    await p.goto(`${BASE}/${s}`, { waitUntil: "networkidle" });
    await save(p, s, 1);
    // Slow the CPU so the live progress is visible in the screenshot.
    const cdp = await p.context().newCDPSession(p);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 40 });
    await p.getByTestId("file-input").first().setInputFiles(FX("guide/long.pdf"));
    await p.getByTestId("progress-percent").waitFor({ timeout: 15_000 });
    await p.waitForFunction(() => Number(document.querySelector('[data-testid="progress-percent"]')?.textContent?.replace("%", "") ?? 0) >= 35, null, { timeout: 30_000 }).catch(() => {});
    await saveCard(p, s, 2);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await p.getByTestId("tool-result").waitFor({ timeout: 120_000 });
    await saveCard(p, s, 3);
  },
  "pdf-to-jpg": (p, s) => workspaceTool(p, s, SAMPLE, null, btn("Convert to JPG")),
  "pdf-to-png": (p, s) => workspaceTool(p, s, SAMPLE, null, btn("Convert to PNG")),
  "pdf-to-text": (p, s) => workspaceTool(p, s, SAMPLE, null, btn("Extract text")),
  "jpg-to-pdf": (p, s) => workspaceTool(p, s, [FX("guide/photo-1.jpg"), FX("guide/photo-2.jpg")], null, async (pg) => pg.getByRole("button", { name: /^Convert 2 images to PDF/ }).click()),
  "png-to-pdf": (p, s) => workspaceTool(p, s, [FX("guide/screenshot.png"), FX("guide/logo.png")], null, async (pg) => pg.getByRole("button", { name: /^Convert 2 images to PDF/ }).click()),

  // ── Convert / optimise (cloud worker)
  "pdf-to-excel": (p, s) => workspaceTool(p, s, SAMPLE, null, btn("PDF to Excel"), { timeout: 60_000 }),
  "pdf-to-powerpoint": (p, s) => workspaceTool(p, s, SAMPLE, null, btn("PDF to PowerPoint"), { timeout: 60_000 }),
  "word-to-pdf": (p, s) => workspaceTool(p, s, FX("guide/report.docx"), null, btn("Word to PDF"), { timeout: 60_000 }),
  "excel-to-pdf": (p, s) => workspaceTool(p, s, FX("guide/budget.xlsx"), null, btn("Excel to PDF"), { timeout: 60_000 }),
  "powerpoint-to-pdf": (p, s) => workspaceTool(p, s, FX("guide/launch.pptx"), null, btn("PowerPoint to PDF"), { timeout: 60_000 }),
  "ocr-pdf": (p, s) => workspaceTool(p, s, SAMPLE, null, btn("OCR PDF"), { timeout: 90_000 }),

  // ── Optimise / security (browser)
  "compress-pdf": (p, s) => workspaceTool(p, s, FX("guide/photos.pdf"), null, btn("Compress PDF"), { timeout: 60_000 }),
  "flatten-pdf": (p, s) => workspaceTool(p, s, FX("form.pdf"), null, btn("Flatten PDF")),
  "watermark-pdf": (p, s) => workspaceTool(p, s, SAMPLE, null, btn("Add watermark")),
  "protect-pdf": (p, s) => workspaceTool(p, s, SAMPLE, async (pg) => {
    await pg.getByLabel("Password", { exact: true }).fill("guide-pass-1");
    await pg.getByLabel("Confirm password").fill("guide-pass-1");
  }, btn("Protect PDF")),
  "unlock-pdf": async (p, s) => {
    await p.goto(`${BASE}/${s}`, { waitUntil: "networkidle" });
    await save(p, s, 1);
    await p.getByTestId("file-input").first().setInputFiles(FX("locked-open.pdf"));
    const dlg = p.getByRole("dialog", { name: "This PDF is password protected" });
    await dlg.waitFor();
    await dlg.getByLabel("PDF password").fill("open-sesame");
    await saveCard(p, s, 2);
    await dlg.getByRole("button", { name: "Unlock" }).click();
    await p.getByTestId("tool-result").waitFor();
    await saveCard(p, s, 3);
  },
  "repair-pdf": async (p, s) => {
    await p.goto(`${BASE}/${s}`, { waitUntil: "networkidle" });
    await save(p, s, 1);
    await p.getByTestId("file-input").first().setInputFiles(FX("guide/damaged.pdf"));
    await p.getByTestId("tool-result").waitFor({ timeout: 30_000 });
    await saveCard(p, s, 2);
    await saveCard(p, s, 3);
  },
};

for (const [slug, flow] of Object.entries(FLOWS)) {
  if (only.length && !only.includes(slug)) continue;
  rmSync(`${OUT}/${slug}`, { recursive: true, force: true });
  const page = await ctx.newPage();
  try {
    const ok = await flow(page, slug);
    results.push([slug, ok === false ? "partial (no result screenshot)" : "ok"]);
  } catch (e) {
    results.push([slug, `partial: ${String(e.message).split("\n")[0].slice(0, 90)}`]);
  } finally {
    await page.close();
  }
}
await browser.close();
for (const [s, r] of results) console.log(`${r === "ok" ? "✓" : "•"} ${s}: ${r}`);
