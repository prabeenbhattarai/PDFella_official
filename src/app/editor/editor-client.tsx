"use client";

import dynamic from "next/dynamic";
import { LogoLoader } from "@/components/ui/logo-loader";

// The editor depends on browser-only APIs (pdf.js, canvas, IndexedDB).
const EditorApp = dynamic(() => import("@/components/editor/editor-app").then((m) => m.EditorApp), {
  ssr: false,
  loading: () => <LogoLoader label="Loading the editor…" />,
});

export function EditorClient() {
  return <EditorApp />;
}
