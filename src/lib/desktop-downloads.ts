/**
 * Desktop installers live on Vercel Blob (Vercel's CDN), uploaded by
 * .github/workflows/desktop.yml through scripts/publish-desktop.mjs. Each platform
 * has a small `desktop/latest-<os>.json` naming its newest installer.
 */
export type DesktopOs = "mac" | "windows";

/** The public address of the pdfella-downloads Blob store. Not a secret. */
export const BLOB_BASE = "https://7qiqke2nvm2dwa9q.public.blob.vercel-storage.com";

export const INSTALLER: Record<DesktopOs, string> = { mac: "PDFella-mac.dmg", windows: "PDFella-windows-setup.exe" };

/** Used only if the CDN can't be reached. */
export const githubInstaller = (os: DesktopOs) => `https://github.com/prabeenbhattarai/PDFella_official/releases/latest/download/${INSTALLER[os]}`;

export const isDesktopOs = (v: string): v is DesktopOs => v === "mac" || v === "windows";

export interface DesktopBuild { version: string; url: string }

/** The newest installer for a platform, or null if the CDN doesn't have one. */
export async function latestBuild(os: DesktopOs): Promise<DesktopBuild | null> {
  try {
    const res = await fetch(`${BLOB_BASE}/desktop/latest-${os}.json`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<DesktopBuild>;
    if (typeof body.version !== "string" || typeof body.url !== "string" || !body.url.startsWith(`${BLOB_BASE}/`)) return null;
    return { version: body.version, url: body.url };
  } catch {
    return null;
  }
}
