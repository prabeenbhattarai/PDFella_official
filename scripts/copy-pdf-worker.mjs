// Copies browser runtime assets into /public so they are served from our own origin (CSP 'self'):
//   - the pdf.js worker
//   - qpdf compiled to WebAssembly (used to decrypt / encrypt / repair PDFs in the browser)
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
copyFileSync("node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm", "public/qpdf.wasm");
