import { describe, expect, it } from "vitest";
import { parsePageRanges, sanitizeFileName, formatBytes } from "@/lib/utils";
import { sniffBytes } from "@/lib/security/filetype";
import { fixture } from "./helpers";

describe("page ranges", () => {
  it("parses ranges, singles and open ends", () => {
    expect(parsePageRanges("1-3, 5, 8-", 9)).toEqual([0, 1, 2, 4, 7, 8]);
    expect(parsePageRanges("-2", 5)).toEqual([0, 1]);
    expect(parsePageRanges("4-100", 5)).toEqual([3, 4]);
  });
  it("rejects garbage", () => {
    expect(() => parsePageRanges("abc", 3)).toThrow();
  });
});

describe("file names", () => {
  it("strips illegal characters and keeps the extension", () => {
    expect(sanitizeFileName('Final: Contract / "Oct" 2026.pdf')).toBe("Final Contract Oct 2026.pdf");
    expect(sanitizeFileName("   ")).toBe("document.pdf");
    expect(sanitizeFileName("notes", "txt")).toBe("notes.txt");
  });
  it("formats sizes", () => {
    expect(formatBytes(8.4 * 1024 * 1024)).toBe("8.4 MB");
  });
});

describe("content sniffing (extension is never trusted)", () => {
  it("detects real PDFs", () => {
    expect(sniffBytes(fixture("sample.pdf").subarray(0, 64), "anything.bin")).toBe("pdf");
  });
  it("detects images by magic bytes", () => {
    expect(sniffBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "x.pdf")).toBe("png");
    expect(sniffBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "x.pdf")).toBe("jpg");
  });
  it("rejects an executable renamed to .pdf", () => {
    expect(sniffBytes(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]), "invoice.pdf")).toBe("unknown");
  });
});
