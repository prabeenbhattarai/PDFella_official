import { describe, expect, it } from "vitest";
import { encryptedSize, fromBase64Url, linkKey, openFile, openName, sealFile, toBase64Url } from "@/lib/share/crypto";

const file = new TextEncoder().encode("%PDF-1.7 pretend file");

describe("share link encryption", () => {
  it("round-trips a file and its name with only the link's secret", async () => {
    const s = await sealFile(file, "Contract ए.pdf");
    expect(s.data.length).toBe(encryptedSize(file.length));
    const key = await linkKey({ secret: s.secret, salt: s.salt, iterations: s.iterations });
    expect(await openName(key, s.nameCt)).toBe("Contract ए.pdf");
    expect(await openFile(key, s.data)).toEqual(file);
  });
  it("doesn't store readable contents or a readable name", async () => {
    const s = await sealFile(file, "Secret name.pdf");
    const raw = new TextDecoder("latin1").decode(s.data);
    expect(raw).not.toContain("%PDF");
    expect(new TextDecoder("latin1").decode(fromBase64Url(s.nameCt))).not.toContain("Secret");
  });
  it("needs both the link and the password", async () => {
    const s = await sealFile(file, "a.pdf", "hunter2");
    expect(s.salt).toBeTruthy();
    const right = await linkKey({ secret: s.secret, salt: s.salt, iterations: s.iterations, password: "hunter2" });
    expect(await openName(right, s.nameCt)).toBe("a.pdf");
    const wrong = await linkKey({ secret: s.secret, salt: s.salt, iterations: s.iterations, password: "nope" });
    await expect(openName(wrong, s.nameCt)).rejects.toBeTruthy();
    const otherLink = await linkKey({ secret: toBase64Url(new Uint8Array(32)), salt: s.salt, iterations: s.iterations, password: "hunter2" });
    await expect(openName(otherLink, s.nameCt)).rejects.toBeTruthy();
  });
  it("rejects a tampered file", async () => {
    const s = await sealFile(file, "a.pdf");
    s.data[s.data.length - 1] ^= 1;
    const key = await linkKey({ secret: s.secret, salt: s.salt, iterations: s.iterations });
    await expect(openFile(key, s.data)).rejects.toBeTruthy();
  });
  it("uses a new key each time", async () => {
    expect((await sealFile(file, "a.pdf")).secret).not.toBe((await sealFile(file, "a.pdf")).secret);
  });
});
