/**
 * Uploads a desktop installer to Vercel Blob, the CDN behind /download/mac and
 * /download/windows, then points `desktop/latest-<os>.json` at it.
 *
 *   node scripts/publish-desktop.mjs <mac|windows> <installer file> <version>
 *
 * Needs BLOB_READ_WRITE_TOKEN, from the environment (GitHub Actions) or .env.local.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { put } from "@vercel/blob";

const NAMES = { mac: "PDFella-mac.dmg", windows: "PDFella-windows-setup.exe" };
const TYPES = { mac: "application/x-apple-diskimage", windows: "application/vnd.microsoft.portable-executable" };
const stop = (msg) => { console.error(msg); process.exit(1); };

const [os, file, version] = process.argv.slice(2);
if (!NAMES[os] || !file || !/^\d+\.\d+\.\d+$/.test(version ?? "")) stop("Usage: node scripts/publish-desktop.mjs <mac|windows> <file> <version, like 0.1.4>");
if (!existsSync(file)) stop(`No file at ${file}`);
// An error page saved by mistake is a few bytes; real installers are megabytes.
if (statSync(file).size < 500_000) stop(`${file} is too small to be an installer (${statSync(file).size} bytes).`);

const fromEnvFile = () => existsSync(".env.local") ? readFileSync(".env.local", "utf8").match(/^BLOB_READ_WRITE_TOKEN=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") : undefined;
const token = process.env.BLOB_READ_WRITE_TOKEN || fromEnvFile();
if (!token) stop("BLOB_READ_WRITE_TOKEN isn't set.");

const options = { access: "public", addRandomSuffix: false, allowOverwrite: true, token };
const installer = await put(`desktop/v${version}/${NAMES[os]}`, readFileSync(file), { ...options, contentType: TYPES[os] });
// Kept short in caches, so a new release shows up within a minute.
await put(`desktop/latest-${os}.json`, JSON.stringify({ version, url: installer.url, size: statSync(file).size }), { ...options, contentType: "application/json", cacheControlMaxAge: 60 });
console.log(`${os} ${version}: ${installer.url}`);
