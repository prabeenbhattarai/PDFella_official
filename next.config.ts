import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Strict CSP. 'unsafe-inline' for styles is required by Next's runtime style tags;
// 'wasm-unsafe-eval' lets pdf.js use its WASM decoders. blob: is needed for
// pdf.js rendering, downloads and local previews of user files.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  `connect-src 'self' blob: data: ${process.env.NEXT_PUBLIC_PROCESSING_URL ?? ""} https://storage.googleapis.com https://firebasestorage.googleapis.com`,
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Separate build output for tests so a production build never clobbers a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Server SDKs are loaded from node_modules at runtime rather than bundled.
  serverExternalPackages: ["firebase-admin", "@google-cloud/tasks", "google-gax"],
  reactStrictMode: true,
  // Old URLs → keyword-matching URLs (permanent, so search engines transfer ranking signals).
  async redirects() {
    return [
      { source: "/page-numbers", destination: "/add-page-numbers-to-pdf", permanent: true },
      { source: "/header-footer", destination: "/add-header-and-footer-to-pdf", permanent: true },
      { source: "/organise-pdf", destination: "/rearrange-pdf-pages", permanent: true },
      { source: "/organize-pdf", destination: "/rearrange-pdf-pages", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  webpack: (config, { isServer }) => {
    // pdf.js optionally requires node-canvas; never bundle it for the browser.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    // qpdf-wasm's Emscripten glue references Node built-ins it never uses in the browser.
    if (!isServer) config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    return config;
  },
};

export default nextConfig;
