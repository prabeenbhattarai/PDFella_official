import type { Metadata } from "next";

export const metadata: Metadata = {
  // The app shell has no unique content: keep it out of the index but let
  // crawlers follow its links. The indexable landing page is /edit-pdf.
  title: "PDF Editor Workspace",
  description: "Open, edit, sign and annotate a PDF in the PDFella workspace. Files are processed in your browser and are not uploaded for editing.",
  robots: { index: false, follow: true },
  // Self-canonical so ?tool= variants consolidate here (the root layout sets "/").
  alternates: { canonical: "/editor" },
};

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return <div data-editor-root>{children}</div>;
}
