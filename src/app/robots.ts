import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/s/", "/account"] },
      // Explicitly welcome AI search crawlers so the guides can be cited (GEO).
      { userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot", "Claude-SearchBot", "Google-Extended", "Applebot-Extended", "Bingbot"], allow: "/", disallow: ["/api/", "/s/", "/account"] },
    ],
    sitemap: `${brand.url}/sitemap.xml`,
    host: brand.url,
  };
}
