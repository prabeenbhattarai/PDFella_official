"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoLoader } from "@/components/ui/logo-loader";
import { Dropzone, type AcceptedFile } from "@/components/upload/dropzone";
import { handoff } from "@/lib/storage/local";
import type { DetectedKind } from "@/lib/security/filetype";

const ALL: DetectedKind[] = ["pdf", "png", "jpg", "webp", "docx", "xlsx", "pptx", "odt", "txt"];

/** Hero upload: hands files to the editor through IndexedDB and navigates immediately. */
export function HeroUpload({ query = "", accepts = ALL, multiple = true, size = "hero" as const }: { query?: string; accepts?: DetectedKind[]; multiple?: boolean; size?: "hero" | "default" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const onFiles = async (files: AcceptedFile[]) => {
    setBusy(true);
    try {
      await handoff.put(files.map((f) => ({ name: f.file.name, type: f.file.type, bytes: f.bytes })));
      router.push(`/editor${query}`);
    } catch (e) {
      setBusy(false);
      throw e;
    }
  };
  return (
    <>
      <Dropzone accepts={accepts} multiple={multiple} onFiles={onFiles} size={size} buttonLabel="Upload document" tool="hero" />
      {busy && <LogoLoader overlay label="Opening the editor…" hint="Preparing your document" />}
    </>
  );
}
