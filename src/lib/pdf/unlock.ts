"use client";

import { decryptPdf, isEncrypted, WrongPasswordError } from "./qpdf";
import { askPassword } from "@/components/ui/password-prompt";

export class PasswordCancelledError extends Error {
  constructor() { super("A password is needed to open this PDF."); }
}

/**
 * Make any PDF fully editable before it enters the app:
 *  - restriction-only PDFs (no open password) are unlocked silently;
 *  - PDFs with an open password prompt the user once, then are decrypted.
 * Everything happens in the browser.
 */
export async function ensureUnlocked(name: string, bytes: Uint8Array): Promise<{ bytes: Uint8Array; wasEncrypted: boolean }> {
  if (!isEncrypted(bytes)) return { bytes, wasEncrypted: false };
  try {
    return { bytes: await decryptPdf(bytes, ""), wasEncrypted: true };
  } catch (e) {
    if (!(e instanceof WrongPasswordError)) return { bytes, wasEncrypted: false }; // not actually encrypted / unreadable: let the normal path report it
  }
  let incorrect = false;
  for (;;) {
    const pw = await askPassword(name, incorrect);
    if (pw === null) throw new PasswordCancelledError();
    try {
      return { bytes: await decryptPdf(bytes, pw), wasEncrypted: true };
    } catch (e) {
      if (!(e instanceof WrongPasswordError)) throw e;
      incorrect = true;
    }
  }
}
