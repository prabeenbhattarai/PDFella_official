import type { Metadata } from "next";
import { SharedFile } from "./shared-file";

export const metadata: Metadata = {
  title: "A PDF was shared with you",
  description: "Download a PDF shared through an encrypted link.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SharedFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <section id="top" className="mx-auto min-h-[70vh] max-w-xl px-4 pt-32 pb-20">
      <SharedFile id={id} />
    </section>
  );
}
