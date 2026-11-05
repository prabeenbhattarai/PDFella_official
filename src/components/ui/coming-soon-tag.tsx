/** Marks a tool that's listed but not available yet. */
export function ComingSoonTag({ className = "" }: { className?: string }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full bg-surface-3 px-1.5 py-px text-[10.5px] font-semibold whitespace-nowrap text-ink-2 ${className}`}>Coming soon</span>;
}
