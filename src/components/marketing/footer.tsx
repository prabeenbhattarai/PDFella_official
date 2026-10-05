import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { brand } from "@/lib/brand";
import { categories, toolsIn, type ToolCategory } from "@/lib/tools";

const cols: ToolCategory[] = ["edit", "organise", "convert", "security"];

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="wrap grid gap-10 py-16 md:grid-cols-[1.6fr_repeat(4,1fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-ink-2">{brand.description}</p>
        </div>
        {cols.map((c) => (
          <div key={c}>
            <p className="mb-3 text-sm font-semibold">{categories[c].name}</p>
            <ul className="space-y-2 text-sm font-medium text-ink-2">
              {toolsIn(c).slice(0, 6).map((t) => (
                <li key={t.slug}><Link href={`/${t.slug}`} className="hover:text-ink">{t.name}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="wrap flex flex-col items-center justify-between gap-3 py-5 text-[13px] text-ink-3 sm:flex-row">
          <p>© {new Date().getFullYear()} {brand.name}. All rights reserved.</p>
          <nav className="flex gap-5" aria-label="Legal">
            <Link href="/pdf-converter" className="hover:text-ink">PDF converter</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/security" className="hover:text-ink">Security</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <a href={`mailto:${brand.supportEmail}`} className="hover:text-ink">Contact</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
