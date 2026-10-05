"use client";

import { useRouter } from "next/navigation";

/**
 * The second, looping copy of a marquee. It is hidden from assistive tech and
 * contains no <a> tags, so crawlers see each link once, but clicks still work.
 */
export function MarqueeClone({ className, children }: { className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div
      className={className}
      aria-hidden
      onClick={(e) => {
        const href = (e.target as HTMLElement).closest<HTMLElement>("[data-href]")?.dataset.href;
        if (href) router.push(href);
      }}
    >
      {children}
    </div>
  );
}
