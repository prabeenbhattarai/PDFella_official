import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { cropPdf, marginsForRotation, readBookmarks, readDetails, writeBookmarks, writeDetails, type Bookmark } from "@/lib/pdf/document-info";
import { fixture } from "./helpers";

const sample = fixture("sample.pdf");
const open = async (bytes: Uint8Array) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
};

describe("crop", () => {
  it("trims each edge of the page as displayed", async () => {
    const before = (await PDFDocument.load(sample)).getPage(0).getCropBox();
    const out = await PDFDocument.load(await cropPdf(sample, { left: 0.1, right: 0.2, top: 0.25, bottom: 0.05 }, "all"));
    const box = out.getPage(0).getCropBox();
    expect(box.x).toBeCloseTo(before.x + before.width * 0.1);
    expect(box.y).toBeCloseTo(before.y + before.height * 0.05);
    expect(box.width).toBeCloseTo(before.width * 0.7);
    expect(box.height).toBeCloseTo(before.height * 0.7);
  });
  it("crops only the chosen page", async () => {
    const out = await PDFDocument.load(await cropPdf(sample, { left: 0.1, right: 0, top: 0, bottom: 0 }, [1]));
    const orig = await PDFDocument.load(sample);
    expect(out.getPage(0).getCropBox().width).toBeCloseTo(orig.getPage(0).getCropBox().width);
    expect(out.getPage(1).getCropBox().width).toBeCloseTo(orig.getPage(1).getCropBox().width * 0.9);
  });
  it("maps what you see onto rotated pages", async () => {
    const m = { left: 0.1, top: 0.2, right: 0.3, bottom: 0.4 };
    expect(marginsForRotation(m, 0)).toEqual(m);
    expect(marginsForRotation(m, 90)).toEqual({ top: 0.3, right: 0.4, bottom: 0.1, left: 0.2 });
    expect(marginsForRotation(m, 180)).toEqual({ top: 0.4, bottom: 0.2, left: 0.3, right: 0.1 });
    expect(marginsForRotation(m, -90)).toEqual({ top: 0.1, left: 0.4, bottom: 0.3, right: 0.2 });

    // Trimming half of the displayed left of a 90° page halves its displayed width.
    const doc = await PDFDocument.load(sample);
    doc.getPage(0).setRotation(degrees(90));
    const before = (await (await open(await doc.save())).getPage(1)).getViewport({ scale: 1 });
    const out = await open(await cropPdf(await doc.save(), { left: 0.5, top: 0, right: 0, bottom: 0 }, [0]));
    const after = (await out.getPage(1)).getViewport({ scale: 1 });
    expect(after.width).toBeCloseTo(before.width / 2);
    expect(after.height).toBeCloseTo(before.height);
  });
});

describe("bookmarks", () => {
  const list: Bookmark[] = [
    { title: "Chapter 1", page: 0, level: 0 },
    { title: "Section ए", page: 1, level: 1, top: 400 },
    { title: "Deep", page: 1, level: 2 },
    { title: "Chapter 2", page: 2, level: 0 },
    { title: "Website", page: 0, level: 0, url: "https://example.com/" },
  ];
  it("round-trips nesting, pages, positions, links and non-Latin titles", async () => {
    const back = await readBookmarks(await open(await writeBookmarks(sample, list)));
    expect(back.map(({ title, page, level }) => ({ title, page, level }))).toEqual(list.map(({ title, page, level }) => ({ title, page, level })));
    expect(back[1].top).toBe(400);
    expect(back[4].url).toBe("https://example.com/");
  });
  it("replaces old bookmarks and can remove them all", async () => {
    const once = await writeBookmarks(sample, list);
    const twice = await writeBookmarks(once, [{ title: "Only", page: 2, level: 0 }]);
    expect((await readBookmarks(await open(twice))).map((b) => b.title)).toEqual(["Only"]);
    expect(await readBookmarks(await open(await writeBookmarks(once, [])))).toEqual([]);
  });
  it("repairs a nesting jump instead of writing a broken tree", async () => {
    const back = await readBookmarks(await open(await writeBookmarks(sample, [{ title: "A", page: 0, level: 3 }, { title: "B", page: 0, level: 5 }])));
    expect(back.map((b) => b.level)).toEqual([0, 1]);
  });
});

describe("file details", () => {
  const details = { title: "Report ए", author: "Asha", subject: "Q3", keywords: "one, two", creator: "App", producer: "Maker" };
  it("writes and reads every field", async () => {
    const back = await readDetails(await writeDetails(sample, details));
    expect(back).toMatchObject(details);
  });
  it("removes everything, leaving no trace in the file", async () => {
    const out = await writeDetails(await writeDetails(sample, details), { title: "", author: "", subject: "", keywords: "", creator: "", producer: "" }, { removeDates: true });
    const back = await readDetails(out);
    expect(back).toMatchObject({ title: "", author: "", subject: "", keywords: "", creator: "", producer: "", created: null, modified: null });
    const raw = new TextDecoder("latin1").decode(out);
    expect(raw).not.toContain("Asha");
    expect(raw).not.toContain("Maker");
  });
});
