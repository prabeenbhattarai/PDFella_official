import type { MetadataRoute } from "next";
import { tools } from "@/lib/tools";
import { CONTENT_UPDATED } from "@/content/seo";
import { getContent } from "@/content/seo";
import { absolute, shotPath } from "@/lib/seo";

/** XML sitemap with tutorial screenshots as image entries (helps Google Images and rich results). */
export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date(CONTENT_UPDATED);
  const toolEntries = tools.map((t) => {
    const c = getContent(t.slug);
    const images = (c?.steps ?? []).flatMap((s) => (s.shot ? [shotPath(t.slug, s.shot)] : [])).filter(Boolean).map((p) => absolute(p!));
    return { url: absolute(`/${t.slug}`), lastModified: updated, changeFrequency: "monthly" as const, priority: 0.9, images };
  });
  return [
    { url: absolute("/"), lastModified: updated, changeFrequency: "weekly", priority: 1 },
    { url: absolute("/pdf-converter"), lastModified: updated, changeFrequency: "monthly", priority: 0.9 },
    ...toolEntries,
    ...["privacy", "security", "terms"].map((p) => ({ url: absolute(`/${p}`), lastModified: updated, changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
