import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { decryptPdf, encryptPdf, isEncrypted, repairPdf, WrongPasswordError } from "@/lib/pdf/qpdf";
import { fixture, pdfText } from "./helpers";

describe("qpdf (WebAssembly) in the browser pipeline", () => {
  it("removes permission-only restrictions without a password", async () => {
    for (const f of ["locked-owner.pdf", "locked-rc4.pdf"]) {
      const src = fixture(f);
      expect(isEncrypted(src)).toBe(true);
      const out = await decryptPdf(src);
      expect(isEncrypted(out)).toBe(false);
      await PDFDocument.load(out); // pdf-lib can now edit it
    }
  });
  it("requires the open password and rejects wrong ones", async () => {
    const src = fixture("locked-open.pdf");
    await expect(decryptPdf(src)).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(decryptPdf(src, "nope")).rejects.toBeInstanceOf(WrongPasswordError);
    const out = await decryptPdf(src, "open-sesame");
    expect((await pdfText(out))[0]).toContain("Service Agreement");
  });
  it("encrypts with AES-256 and round-trips", async () => {
    const locked = await encryptPdf(fixture("sample.pdf"), { userPassword: "pw1234", allowPrint: true, allowCopy: false, allowEdit: false });
    expect(isEncrypted(locked)).toBe(true);
    await expect(decryptPdf(locked)).rejects.toBeInstanceOf(WrongPasswordError);
    expect((await pdfText(await decryptPdf(locked, "pw1234")))).toHaveLength(3);
  });
  it("repairs a file with a missing cross-reference table", async () => {
    const good = fixture("sample.pdf");
    const text = new TextDecoder("latin1").decode(good);
    const broken = good.slice(0, text.lastIndexOf("xref"));
    const fixed = await repairPdf(broken);
    expect((await PDFDocument.load(fixed)).getPageCount()).toBe(3);
  });
});
