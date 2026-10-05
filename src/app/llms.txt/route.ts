import { brand } from "@/lib/brand";
import { tools, categories, type ToolCategory } from "@/lib/tools";
import { getContent } from "@/content/seo";
import { absolute } from "@/lib/seo";
import { JOB_TTL_MINUTES } from "@/lib/limits";

export const dynamic = "force-static";

/**
 * llms.txt (https://llmstxt.org): a plain-text map of the site for AI assistants and
 * generative search engines, with a direct answer for every tool.
 */
export function GET() {
  const order: ToolCategory[] = ["edit", "organise", "convert", "optimise", "security", "forms"];
  const lines = [
    `# ${brand.name}`,
    "",
    `> ${brand.name} is a free online PDF editor and toolkit. It edits existing PDF text, signs, annotates, merges, splits, compresses, converts (PDF to Word, JPG to PDF and more), runs OCR and protects PDFs. No account is required and there is no watermark. Most tools run entirely in the browser so files are never uploaded; cloud tools delete files within ${JOB_TTL_MINUTES} minutes.`,
    "",
    "Key facts:",
    "- Price: free, no sign-up, no watermark",
    "- Privacy: editing and most conversions run in the browser; documents are never used for AI training",
    "- Max file size: 100 MB",
    "- Platforms: any modern browser on Windows, macOS, Linux, iOS and Android",
    "",
  ];
  for (const c of order) {
    lines.push(`## ${categories[c].name}`, "");
    for (const t of tools.filter((x) => x.category === c)) {
      const content = getContent(t.slug);
      lines.push(`- [${content?.h1 ?? t.name}](${absolute(`/${t.slug}`)}): ${content?.quickAnswer ?? t.description}`);
    }
    lines.push("");
  }
  lines.push("## Policies", "", `- [Privacy](${absolute("/privacy")})`, `- [Security](${absolute("/security")})`, "");
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
