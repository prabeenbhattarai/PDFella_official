import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo />
      <h1 className="font-display text-5xl">Page not found</h1>
      <p className="text-ink-3">The page you&apos;re looking for doesn&apos;t exist.</p>
      <div className="flex gap-3">
        <Link href="/" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink">Go home</Link>
        <Link href="/editor" className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Open editor</Link>
      </div>
    </main>
  );
}
