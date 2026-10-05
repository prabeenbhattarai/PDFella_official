import { ChevronDown } from "lucide-react";

/** FAQ accordion. Emits FAQPage JSON-LD unless the page already includes it in its own graph. */
export function Faq({ items, schema: withSchema = true }: { items: { q: string; a: string }[]; schema?: boolean }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
      {items.map((i) => (
        <details key={i.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium">
            {i.q}
            <ChevronDown className="size-4 shrink-0 text-ink-3 transition group-open:rotate-180" />
          </summary>
          <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">{i.a}</p>
        </details>
      ))}
      {withSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />}
    </div>
  );
}
