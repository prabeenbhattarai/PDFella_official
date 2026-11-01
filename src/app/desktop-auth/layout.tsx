import type { Metadata } from "next";

export const metadata: Metadata = { title: "Desktop sign-in", robots: { index: false, follow: false } };

export default function DesktopAuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center bg-bg p-6">{children}</main>;
}
