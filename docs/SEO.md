# SEO, AEO & GEO

How the site is set up to rank in Google (SEO), be quoted by answer engines and featured snippets (AEO), and be cited by AI search such as ChatGPT, Perplexity, Gemini and Google AI Overviews (GEO).

## 1. Keyword research (October 2026)

Volumes are third-party estimates (Semrush / Ahrefs public pages, single-country databases). Use them for **relative priority**, then confirm with Google Search Console and Keyword Planner once live.

| Keyword | Est. monthly searches (sample market) | Source | Target page |
|---|---|---|---|
| jpg to pdf | 4.8M–6.1M (IN) | Ahrefs (ilovepdf.com), Semrush | `/jpg-to-pdf` |
| pdf to word | 4.0M–5.0M (IN) | Ahrefs, Semrush | `/pdf-to-word` |
| pdf to jpg | 4.1M (IN) | Semrush | `/pdf-to-jpg` |
| pdf editor | 2.7M (IN) | Semrush (sejda.com) | `/` + `/edit-pdf` |
| online pdf editor | 2.2M (IN) | Semrush (sejda.com) | `/` + `/edit-pdf` |
| jpg to pdf converter | 2.2M (IN) | Semrush (freepdfconvert.com) | `/jpg-to-pdf` |
| pdf to word converter | 1.5M (IN) | Ahrefs | `/pdf-to-word` |
| pdf size reducer | 1.0M (IN) | Semrush | `/compress-pdf` |
| pdf converter | 823K (IN) | Semrush | `/pdf-converter` (hub) |
| doc to pdf converter | 823K (IN) | Semrush | `/word-to-pdf` |
| pdf editor online | 673K (IN) | Semrush | `/edit-pdf` |
| merge pdf | 74K (BD) | Semrush (pdfguru.com) | `/merge-pdf` |
| compress pdf | 40.5K (BD) | Semrush | `/compress-pdf` |

Sources: [ahrefstop.com/websites/ilovepdf.com](https://ahrefstop.com/websites/ilovepdf.com), [semrush.com/website/ilovepdf.com](https://www.semrush.com/website/ilovepdf.com/overview/), [semrush.com/website/smallpdf.com](https://www.semrush.com/website/smallpdf.com/overview/), [semrush.com/website/sejda.com](https://www.semrush.com/website/sejda.com/overview/), [semrush.com/website/pdfguru.com](https://www.semrush.com/website/pdfguru.com/overview/), [semrush.com/website/freepdfconvert.com](https://www.semrush.com/website/freepdfconvert.com/overview/).

Every one of the 38 tools has its own page with a primary keyword and close variants (`src/content/seo/*.ts`, field `keyword` / `keywords`).

## 2. What's implemented

### On-page SEO (every tool page)
- Keyword-first `<title>` ≤ 60 chars and meta description 110–160 chars (enforced by `tests/unit/seo.test.ts`).
- One H1 containing the keyword; logical H2/H3 structure.
- ~900+ words of unique, product-accurate content: quick answer, step-by-step tutorial, benefits, explainer sections, use cases, tips, features, 6–8 FAQs.
- **Real screenshots** of the product for each tutorial step (`public/guides/<slug>/<n>.jpg`, captured by `npm run guides`), descriptive alt text, served through `next/image` (WebP/AVIF, lazy, sized to avoid layout shift).
- Breadcrumbs, related tools and a PDF Converter hub for internal linking.
- Keyword URLs (`/add-page-numbers-to-pdf`, `/rearrange-pdf-pages`, `/add-header-and-footer-to-pdf`) with 308 redirects from older URLs.
- "Updated <date>" freshness signal.

### Structured data (JSON-LD)
- Home: `Organization`, `WebSite`, `WebApplication`, `HowTo`, `FAQPage`. One H1 with the primary keyword ("Free online PDF editor"), keyword-led H2s, and a keyword-anchored link strip to the top tool pages.
- Tool pages: `WebPage`, `BreadcrumbList`, `SoftwareApplication` (free offer), `HowTo` (steps + screenshots), `FAQPage`.
- Hub: `CollectionPage`, `ItemList`, `BreadcrumbList`, `FAQPage`.
- No fabricated ratings or reviews. Add `aggregateRating` only when you have genuine, displayed reviews.

### AEO (answer engines, featured snippets)
- A 40–60 word **Quick answer** at the top of every page that directly answers "How do I …?", reused as the HowTo description.
- Question-shaped FAQ headings with concise answers.
- Numbered steps with clear titles (eligible for list snippets).
- A **Key facts** table (price, account, processing, formats, limits).

### GEO (AI search & assistants)
- `/llms.txt`: a plain-text map of the site with the quick answer for every tool ([llmstxt.org](https://llmstxt.org)).
- `robots.txt` explicitly allows GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Claude-SearchBot, Google-Extended, Applebot-Extended and Bingbot.
- Self-contained, factual statements (no vague marketing claims) that models can quote accurately; consistent facts across pages.

### Technical
- Static generation of all pages (fast TTFB, Core Web Vitals friendly).
- Per-page Open Graph / Twitter images generated at build (`opengraph-image.tsx`).
- `sitemap.xml` with image entries for every tutorial screenshot; `robots.txt`; `manifest.webmanifest`; canonical URLs; `max-image-preview:large` and `max-snippet:-1` for Google.
- Google & Bing verification via env vars.

## 3. Launch checklist

1. Set `NEXT_PUBLIC_SITE_URL=https://your-domain.com` **at build time**. It drives canonical URLs, sitemap, OG and structured data.
2. Deploy, then verify the domain in **Google Search Console** (set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`) and **Bing Webmaster Tools** (`NEXT_PUBLIC_BING_SITE_VERIFICATION`, which also feeds ChatGPT search and Copilot).
3. Submit `https://your-domain.com/sitemap.xml` in both.
4. Test a few URLs with Google's **Rich Results Test** and **URL Inspection → Request indexing** (start with /, /pdf-to-word, /jpg-to-pdf, /edit-pdf, /merge-pdf, /compress-pdf).
5. Run the processing worker with LibreOffice and Tesseract (Docker image) and re-run `npm run guides` so the Office-to-PDF and OCR tutorials get their result screenshots.
6. After 4–6 weeks, use Search Console **Performance** data to see which queries each page earns impressions for, and expand those pages' sections and FAQs accordingly.

## 4. What drives rankings beyond the page

On-page work makes pages eligible to rank. In this highly competitive niche, positions depend heavily on:
- **Backlinks:** get listed in "best free PDF tools" roundups, productivity newsletters, Product Hunt, and alternative-to directories; publish genuinely useful guides others cite.
- **User signals:** fast, successful task completion (which this product is built for).
- **Brand searches:** promote the PDFella name consistently (social profiles, directories) so branded searches grow; the name lives in `src/lib/brand.ts`.
- **Consistency:** keep content accurate as features change; update `CONTENT_UPDATED` when you revise guides.

## 5. Adding or editing a page
1. Add the tool to `src/lib/tools.ts`.
2. Add its content object to the right file in `src/content/seo/` (tests fail until every tool has content that meets the rules).
3. Add a capture flow to `scripts/capture-guides.mjs` and run `npm run guides` against a production build.
