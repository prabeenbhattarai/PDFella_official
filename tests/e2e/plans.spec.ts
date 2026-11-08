import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { fixturePath, openInEditor } from "./helpers";

const actAs = (page: Page, plan: "free" | "lite" | "pro") => page.addInitScript((p) => localStorage.setItem("pdfella.plan-preview", p), plan);
const expectUpgrade = async (page: Page, feature: string) => {
  const dialog = page.getByTestId("upgrade-dialog");
  await expect(dialog).toHaveAttribute("data-feature", feature);
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(dialog).toHaveCount(0);
};

test.describe("free plan", () => {
  test.beforeEach(async ({ page }) => { await actAs(page, "free"); });

  test("Pro features show the Premium dialog instead of working", async ({ page }) => {
    await openInEditor(page);

    await page.getByRole("button", { name: "New tab" }).click();
    await expectUpgrade(page, "tabs");
    await expect(page.getByRole("tab")).toHaveCount(1);

    await page.locator('nav[aria-label="Tools"] [data-tool="signature"]').click();
    await expectUpgrade(page, "signature");

    await page.locator('nav[aria-label="Tools"] [data-tour="group-Stamps"], nav[aria-label="Tools"] [data-tool="stamp"]').first().click();
    if (!(await page.getByTestId("upgrade-dialog").count())) await page.getByRole("menuitem").filter({ hasText: /Stamp/ }).first().click();
    await expectUpgrade(page, "stamp");

    await page.getByRole("button", { name: "Crop pages" }).click();
    await expectUpgrade(page, "crop");
    await page.getByRole("button", { name: "Edit bookmarks" }).click();
    await expectUpgrade(page, "bookmarks");

    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Save as template" }).click();
    await expectUpgrade(page, "templates");
  });

  test("common fonts stay free, and others are marked Pro and locked", async ({ page }) => {
    await openInEditor(page);
    await page.locator('nav[aria-label="Tools"] [data-tool="text"]').click();
    await page.getByRole("button", { name: "Font", exact: true }).first().click();
    const list = page.getByRole("listbox", { name: "Fonts" });
    await list.locator('[data-font="Times"]').click();
    await expect(page.getByTestId("upgrade-dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Font", exact: true }).first().click();
    const premium = page.getByRole("listbox", { name: "Fonts" }).locator('[data-font="roboto"]');
    await expect(premium).toContainText("LITE");
    await premium.click();
    await expectUpgrade(page, "fonts");
  });

  test("everyday editing still works", async ({ page }) => {
    await openInEditor(page);
    await page.locator('nav[aria-label="Tools"] [data-tool="text"]').click();
    const box = (await page.locator('[data-page-index="0"]').boundingBox())!;
    await page.mouse.click(box.x + 150, box.y + 300);
    await expect(page.locator("[data-page-layer] > [data-obj-id]")).toHaveCount(1);
    await expect(page.getByTestId("upgrade-dialog")).toHaveCount(0);
  });

  test("the fourth document in a day asks to upgrade, and the first three don't", async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await openInEditor(page);
      await expect(page.getByTestId("upgrade-dialog")).toHaveCount(0);
    }
    await page.goto("/editor");
    await page.getByTestId("file-input").setInputFiles(fixturePath("sample.pdf"));
    await expect(page.getByTestId("upgrade-dialog")).toHaveAttribute("data-feature", "documents");
    await expect(page.locator("[data-page-index]")).toHaveCount(0);
  });

  test("the dialog links to the pricing page, which lists the real plans", async ({ page }) => {
    await openInEditor(page);
    await page.getByRole("button", { name: "New tab" }).click();
    await expect(page.getByTestId("upgrade-dialog").getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/pricing");
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: "Pro", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lite", exact: true })).toBeVisible();
    await expect(page.getByText("7-day")).toHaveCount(0);
    // Only what's live: the cloud tools aren't connected, and there are no team features.
    await expect(page.locator("#main").getByText(/cloud task|team plan|60\+/i)).toHaveCount(0);
    await expect(page.getByRole("cell", { name: /OCR|Office/ })).toHaveCount(0);
    await expect(page.getByText("$4").first()).toBeVisible();
    await expect(page.getByText("$8").first()).toBeVisible();
  });
});

test.describe("Lite plan", () => {
  test.beforeEach(async ({ page }) => { await actAs(page, "lite"); });

  test("has the everyday paid features, but not Pro's", async ({ page }) => {
    await openInEditor(page);
    await page.getByRole("button", { name: "Edit bookmarks" }).click();
    await expect(page.getByRole("dialog")).toContainText("Edit bookmarks");
    await expect(page.getByTestId("upgrade-dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.locator('nav[aria-label="Tools"] [data-tool="signature"]').click();
    await expect(page.getByTestId("upgrade-dialog")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Save as template" }).click();
    await expect(page.getByTestId("upgrade-dialog")).toHaveAttribute("data-plan", "pro");
    await expectUpgrade(page, "templates");
  });

  test("allows three tabs, then offers Pro", async ({ page }) => {
    await openInEditor(page);
    const add = page.getByRole("button", { name: "New tab" });
    await add.click();
    await page.getByRole("button", { name: /Start with a blank page/ }).click();
    await expect(page.getByRole("tab")).toHaveCount(2);
    await expect(page.locator("[data-page-index]")).toHaveCount(1);
    await add.click();
    await expect(page.getByRole("tab")).toHaveCount(3);
    await page.getByRole("button", { name: /Start with a blank page/ }).click();
    await expect(page.locator("[data-page-index]")).toHaveCount(1);
    await add.click();
    await expect(page.getByTestId("upgrade-dialog")).toHaveAttribute("data-plan", "pro");
    await expectUpgrade(page, "more-tabs");
    await expect(page.getByRole("tab")).toHaveCount(3);
  });
});

test.describe("Pro plan", () => {
  test.beforeEach(async ({ page }) => { await actAs(page, "pro"); });

  test("nothing is locked or marked", async ({ page }) => {
    await openInEditor(page);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Save as template" }).click();
    await expect(page.getByTestId("upgrade-dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "New tab" }).click();
    await expect(page.getByRole("tab")).toHaveCount(2);
    await page.getByRole("tab").first().click();
    await page.getByRole("button", { name: "Edit bookmarks" }).click();
    await expect(page.getByRole("dialog")).toContainText("Edit bookmarks");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("upgrade-dialog")).toHaveCount(0);
    await expect(page.getByTitle("Paid feature")).toHaveCount(0);
  });

  test("more than three documents a day is fine", async ({ page }) => {
    for (let i = 0; i < 4; i++) await openInEditor(page);
    await expect(page.getByTestId("upgrade-dialog")).toHaveCount(0);
  });
});

test("the pricing page's demo plays through the plans and can be switched", async ({ page }) => {
  await page.goto("/pricing");
  const demo = page.getByTestId("plan-demo");
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute("data-plan", "free");
  await expect(page.getByTestId("plan-demo-caption")).toContainText("Free:");

  await demo.getByRole("tab", { name: /Pro/ }).click();
  await expect(demo).toHaveAttribute("data-plan", "pro");
  await expect(page.getByTestId("plan-demo-caption")).toContainText("Pro:");
  await demo.getByRole("tab", { name: /Lite/ }).click();
  await expect(page.getByTestId("plan-demo-caption")).toContainText("Lite:");
});

test("Pricing is in the main menu, on desktop and on phones", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.locator("header").getByRole("link", { name: "Pricing", exact: true }).first().click();
  await page.waitForURL(/\/pricing/);
  await expect(page.getByRole("heading", { name: "Pro", exact: true })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.locator("header").getByRole("link", { name: "Pricing", exact: true }).last().click();
  await page.waitForURL(/\/pricing/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

test("the pricing page shows your current plan, and says what isn't included", async ({ page }) => {
  await actAs(page, "lite");
  await page.goto("/pricing");
  await expect(page.getByTestId("your-plan")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: /^Lite/ })).toContainText("Your plan");
  await expect(page.getByRole("link", { name: "Manage your plan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Switch to Pro" })).toBeVisible();
  await expect(page.getByText("Prices are in US dollars")).toBeVisible();
  await expect(page.getByText("Do plans include tools marked Coming soon?")).toBeVisible();
});

test("signatures and stamps are locked on Free, and stamps open on Lite", async ({ page }) => {
  const check = async (plan: "free" | "lite" | "pro", expected: Record<string, boolean>) => {
    await page.addInitScript((p) => localStorage.setItem("pdfella.plan-preview", p), plan);
    await openInEditor(page);
    const rail = page.locator('nav[aria-label="Tools"]');
    for (const [selector, open] of Object.entries(expected)) {
      await rail.locator(selector).click();
      const menuItem = page.getByRole("menuitem").filter({ hasText: /stamp/i }).first();
      if (selector.includes("Stamps") && await menuItem.count()) await menuItem.click();
      const dialog = page.getByTestId("upgrade-dialog");
      if (open) await expect(dialog, `${plan}: ${selector}`).toHaveCount(0);
      else await expect(dialog, `${plan}: ${selector}`).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
  };
  const SIGN = '[data-tool="signature"]', STAMP = '[data-tour="group-Stamps"]';
  await check("free", { [SIGN]: false, [STAMP]: false });
  await check("lite", { [STAMP]: true });
});

test.describe("the desktop app is free, with the same plans as the browser", () => {
  const DESKTOP = "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15 PDFellaDesktop/0.1.5";

  test("the download is open on the free plan", async ({ page }) => {
    await actAs(page, "free");
    await page.goto("/download");
    await expect(page.locator('a[href^="/download/"]').first()).toBeAttached();
    await page.locator("#main").getByRole("link", { name: /Download for/ }).first().waitFor();
    await expect(page.getByTestId("upgrade-dialog")).toHaveCount(0);
  });

  test("in the app, free tools work and paid ones ask for a plan", async ({ browser }) => {
    const page = await (await browser.newContext({ userAgent: DESKTOP })).newPage();
    await actAs(page, "free");
    await openInEditor(page);
    await expect(page.getByTestId("upgrade-dialog")).toHaveCount(0);
    await page.locator('nav[aria-label="Tools"] [data-tool="signature"]').click();
    await expect(page.getByTestId("upgrade-dialog")).toHaveAttribute("data-feature", "signature");
  });
});

test.describe("file sizes follow the plan", () => {
  const mb = 1024 * 1024;
  const dir = mkdtempSync(path.join(tmpdir(), "pdfella-size-"));
  /** A file of exactly this size, without using the disk space. */
  const pdfOfSize = (size: number) => {
    const file = path.join(dir, `size-${size}.pdf`);
    writeFileSync(file, "%PDF-1.7\n");
    truncateSync(file, size);
    return file;
  };
  const over = (page: Page) => page.getByText(/The limit is/);
  const tryFile = async (page: Page, plan: "free" | "lite" | "pro", size: number) => {
    await actAs(page, plan);
    await page.goto("/compress-pdf");
    await expect(page.getByTestId("dropzone")).toBeVisible();
    await page.getByTestId("file-input").setInputFiles(pdfOfSize(size));
  };
  test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("Free stops at 100 MB", async ({ page }) => {
    await tryFile(page, "free", 101 * mb);
    await expect(over(page)).toContainText("100 MB");
  });
  test("Lite takes more than 100 MB, and stops at 250 MB", async ({ page }) => {
    await tryFile(page, "lite", 251 * mb);
    await expect(over(page)).toContainText("250 MB");
    await page.getByTestId("file-input").setInputFiles(pdfOfSize(101 * mb));
    await expect(over(page)).toHaveCount(0);
  });
  test("Pro stops at 500 MB", async ({ page }) => {
    await tryFile(page, "pro", 501 * mb);
    await expect(over(page)).toContainText("500 MB");
  });
  test("each plan's limit is shown on the upload area", async ({ page }) => {
    await actAs(page, "lite");
    await page.goto("/compress-pdf");
    await expect(page.getByTestId("dropzone")).toContainText("up to 250 MB");
  });
});

test("the legal pages only describe what's switched on", async ({ page }) => {
  await page.goto("/terms");
  const terms = page.locator("#main");
  await expect(terms).toContainText("Australian Consumer Law");
  await expect(terms).not.toContainText("placeholder");
  await expect(terms).not.toContainText("Paid plans");

  await page.goto("/privacy");
  const privacy = page.locator("#main");
  await expect(privacy).toContainText("tagged with your account ID");
  await expect(privacy).not.toContainText("isolated container");
  await expect(privacy).not.toContainText("Stripe");
  await expect(privacy).not.toContainText("only in the memory");
});

test.describe("first-time offer", () => {
  const visit = async (page: Page, eligible: boolean) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => false }); localStorage.setItem("pdfella.plan-preview", "free"); });
    await page.route("**/api/reward", (r) => (r.request().method() === "GET" ? r.fulfill({ json: { eligible } }) : r.continue()));
    await page.goto("/");
  };

  test("a new visitor sees the question, and can only claim after answering both parts", async ({ page }) => {
    await visit(page, true);
    const survey = page.getByTestId("welcome-survey");
    await expect(survey).toBeVisible({ timeout: 20_000 });
    const claim = page.getByTestId("reward-claim");
    await expect(claim).toBeDisabled();
    await page.getByLabel("How did you find PDFella?").selectOption("search");
    await expect(claim).toBeDisabled();
    await survey.getByRole("radio", { name: "Redaction" }).click();
    await expect(claim).toBeEnabled();
  });

  test("saying no thanks means it doesn't come back", async ({ page }) => {
    await visit(page, true);
    await expect(page.getByTestId("welcome-survey")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "No thanks" }).click();
    await page.reload();
    await page.waitForTimeout(10_000);
    await expect(page.getByTestId("welcome-survey")).toHaveCount(0);
  });

  test("anyone the server says doesn't qualify never sees it", async ({ page }) => {
    await visit(page, false);
    await page.waitForTimeout(10_000);
    await expect(page.getByTestId("welcome-survey")).toHaveCount(0);
  });
});

test("desktop downloads go through our own address", async ({ request }) => {
  for (const os of ["mac", "windows"]) {
    const res = await request.get(`/download/${os}`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toMatch(/^https:\/\/(7qiqke2nvm2dwa9q\.public\.blob\.vercel-storage\.com|github\.com)\//);
  }
  expect((await request.get("/download/linux", { maxRedirects: 0 })).status()).toBe(404);
});
