#!/usr/bin/env node
/**
 * Copy the editor's font library from @fontsource/* into public/fonts and record
 * which styles each family ships (src/lib/fonts/available.json).
 *
 * WOFF (not WOFF2) is used because the same file is both loaded by the browser
 * and embedded (subset) into saved PDFs by pdf-lib/fontkit.
 *
 * Run after changing CATALOG in src/lib/fonts/catalog.ts: `npm run fonts`.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const catalog = readFileSync(join(root, "src/lib/fonts/catalog.ts"), "utf8");
const ids = [...catalog.matchAll(/\bid: "([a-z0-9-]+)"/g)].map((m) => m[1]).filter((id) => !["helvetica", "times", "courier"].includes(id));
const VARIANTS = ["400-normal", "700-normal", "400-italic", "700-italic"];
const SUBSETS = ["latin", "latin-ext"];

const out = join(root, "public/fonts");
rmSync(out, { recursive: true, force: true });
const available = {};
for (const id of ids) {
  const src = join(root, "node_modules/@fontsource", id, "files");
  if (!existsSync(src)) throw new Error(`@fontsource/${id} is not installed (npm i -D @fontsource/${id})`);
  mkdirSync(join(out, id), { recursive: true });
  const styles = [];
  let ext = false;
  for (const v of VARIANTS) {
    for (const sub of SUBSETS) {
      const file = join(src, `${id}-${sub}-${v}.woff`);
      if (!existsSync(file)) continue;
      copyFileSync(file, join(out, id, `${v}-${sub}.woff`));
      if (sub === "latin") styles.push(v);
      else ext = true;
    }
  }
  if (!styles.includes("400-normal")) throw new Error(`${id} has no regular style`);
  // Open-font licences (OFL/Apache) require the licence to travel with the files.
  const licence = join(root, "node_modules/@fontsource", id, "LICENSE");
  if (!existsSync(licence)) throw new Error(`@fontsource/${id} has no LICENSE file`);
  copyFileSync(licence, join(out, id, "LICENSE.txt"));
  available[id] = { styles, ext };
}
writeFileSync(join(root, "src/lib/fonts/available.json"), JSON.stringify(available, null, 1) + "\n");
console.log(`Copied ${ids.length} font families to public/fonts`);
