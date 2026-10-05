import { Suspense } from "react";
import { EditorClient } from "./editor-client";
import { LogoLoader } from "@/components/ui/logo-loader";

export default function EditorPage() {
  return (
    <Suspense fallback={<LogoLoader label="Loading the editor…" />}>
      <EditorClient />
    </Suspense>
  );
}
