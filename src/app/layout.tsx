import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, Caveat, Dancing_Script, Great_Vibes, Mrs_Saint_Delafield } from "next/font/google";
import "./globals.css";
import { brand } from "@/lib/brand";
import { Toaster } from "@/components/ui/toast";
import { PasswordPrompt } from "@/components/ui/password-prompt";
import { themeInitScript } from "@/components/ui/theme";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Handwriting fonts for typed signatures. @font-face files are only downloaded when actually used.
const sig1 = Dancing_Script({ subsets: ["latin"], variable: "--font-sig-1", display: "swap", preload: false });
const sig2 = Great_Vibes({ subsets: ["latin"], weight: "400", variable: "--font-sig-2", display: "swap", preload: false });
const sig3 = Caveat({ subsets: ["latin"], variable: "--font-sig-3", display: "swap", preload: false });
const sig4 = Mrs_Saint_Delafield({ subsets: ["latin"], weight: "400", variable: "--font-sig-4", display: "swap", preload: false });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display-serif", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(brand.url),
  title: { default: `Free Online PDF Editor: Edit, Convert & Sign PDFs | ${brand.name}`, template: `%s | ${brand.name}` },
  description: "Free online PDF editor. Edit PDF text, sign, merge, compress and convert PDF to Word or JPG to PDF in your browser. No sign-up, no watermark, private.",
  applicationName: brand.name,
  keywords: ["pdf editor", "online pdf editor", "edit pdf", "free pdf editor", "pdf converter", "pdf to word", "jpg to pdf", "merge pdf", "compress pdf", "sign pdf"],
  authors: [{ name: brand.name }],
  creator: brand.name,
  publisher: brand.name,
  category: "productivity",
  openGraph: { type: "website", siteName: brand.name, locale: "en_US", title: `Free Online PDF Editor | ${brand.name}`, description: brand.description, url: "/" },
  twitter: { card: "summary_large_image", title: `Free Online PDF Editor | ${brand.name}`, description: brand.description },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  formatDetection: { telephone: false, email: false, address: false },
  // Google Search Console / Bing Webmaster verification (set in the environment once the domain is live).
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } : undefined,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1013" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${serif.variable} ${sig1.variable} ${sig2.variable} ${sig3.variable} ${sig4.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[300] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-md">Skip to content</a>
        {children}
        <Toaster />
        <PasswordPrompt />
      </body>
    </html>
  );
}
