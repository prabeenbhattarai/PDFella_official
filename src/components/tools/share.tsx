"use client";

import { useCallback, useState } from "react";
import type { Tool } from "@/lib/tools";
import { ShareForm } from "@/components/share/share-form";
import { FileChip, Intake, type LoadedFile } from "./shared";

export function ShareWorkspace({ tool }: { tool: Tool }) {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const onFiles = useCallback((f: LoadedFile[]) => setFile(f[0]), []);
  const getFile = useCallback(async () => ({ name: file!.name, bytes: file!.bytes }), [file]);
  if (!file) return <Intake tool={tool} onFiles={onFiles} />;
  return (
    <div className="space-y-4">
      <FileChip file={file} onRemove={() => setFile(null)} />
      <ShareForm key={file.id} getFile={getFile} />
    </div>
  );
}
