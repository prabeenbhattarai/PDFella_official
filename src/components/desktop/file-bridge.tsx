"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { isDesktopApp } from "@/lib/auth/desktop";
import { receiveFiles, type IncomingFile } from "@/lib/desktop-files";
import { limitsFor } from "@/lib/limits";
import { currentTier } from "@/lib/plans";
import { cloudToolsEnabled } from "@/lib/tools";
import { sniffBytes } from "@/lib/security/filetype";
import { formatBytes } from "@/lib/utils";

/** What the desktop app (desktop/src-tauri/src/lib.rs) fills in as it reads a double-clicked file. */
interface NativeFile { name: string; chunks: string[]; done: boolean; tooBig?: boolean }

declare global {
  interface Window {
    __pdfellaIncoming?: NativeFile[];
    __pdfellaFileDone?: () => void;
  }
}

const OPENS_IN_EDITOR = new Set(["pdf", "png", "jpg", "webp", ...(cloudToolsEnabled ? ["docx", "xlsx", "pptx", "odt", "txt"] : [])]);

const decode = (chunks: string[]) => {
  const parts = chunks.map((c) => Uint8Array.from(atob(c), (ch) => ch.charCodeAt(0)));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

const tooBig = (name: string) => toast.error(`“${name}” is too large`, `Your plan allows files up to ${formatBytes(limitsFor(currentTier()).maxFileBytes)}.`);

/**
 * Desktop app only: opens double-clicked PDFs, and files dropped on the window
 * outside any upload area, in the editor. Upload areas keep handling their own drops.
 */
export function DesktopFileBridge() {
  const router = useRouter();
  useEffect(() => {
    if (!isDesktopApp()) return;

    const deliver = (files: IncomingFile[]) => {
      if (files.length && !receiveFiles(files)) router.push("/editor");
    };

    const takeNative = () => {
      const incoming = window.__pdfellaIncoming ?? [];
      const ready = incoming.filter((f) => f.done);
      window.__pdfellaIncoming = incoming.filter((f) => !f.done);
      const files: IncomingFile[] = [];
      for (const f of ready) {
        const bytes = f.tooBig ? null : decode(f.chunks);
        if (!bytes || bytes.length > limitsFor(currentTier()).maxFileBytes) tooBig(f.name);
        else files.push({ name: f.name, type: "application/pdf", bytes });
      }
      deliver(files);
    };
    window.__pdfellaFileDone = takeNative;
    takeNative();

    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      // Stops the window navigating to the file. Upload areas have already taken theirs.
      const handled = e.defaultPrevented;
      e.preventDefault();
      if (handled) return;
      const files: IncomingFile[] = [];
      for (const f of Array.from(e.dataTransfer?.files ?? [])) {
        if (f.size > limitsFor(currentTier()).maxFileBytes) { tooBig(f.name); continue; }
        const bytes = new Uint8Array(await f.arrayBuffer());
        if (OPENS_IN_EDITOR.has(sniffBytes(bytes.subarray(0, 4096), f.name))) files.push({ name: f.name, type: f.type, bytes });
        else toast.error(`Can't open “${f.name}”`, cloudToolsEnabled ? "Use a PDF, image or Office document." : "Use a PDF or an image.");
      }
      deliver(files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.__pdfellaFileDone = undefined;
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [router]);
  return null;
}
