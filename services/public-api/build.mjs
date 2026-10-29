// Bundles the public API into dist/ with the two runtime assets it loads from disk:
// qpdf's WebAssembly and pdf.js's Node worker. firebase-admin stays external
// (native/gRPC dependencies); the Dockerfile installs it next to the bundle.
import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const dist = path.join(here, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await build({
  entryPoints: { server: path.join(here, "src/server.ts"), cli: path.join(here, "src/cli.ts") },
  outdir: dist,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  tsconfig: path.join(root, "tsconfig.json"),
  // pdf.js recommends its legacy build in Node.
  alias: { "pdfjs-dist": "pdfjs-dist/legacy/build/pdf.mjs" },
  external: ["firebase-admin", "firebase-admin/*"],
  // Bundled CommonJS dependencies (qpdf's Emscripten glue among them) expect require() and __dirname.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import { dirname as __dn } from 'node:path';"
      + " const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);",
  },
  logLevel: "info",
});
await copyFile(path.join(root, "node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm"), path.join(dist, "qpdf.wasm"));
await copyFile(path.join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"), path.join(dist, "pdf.worker.mjs"));
