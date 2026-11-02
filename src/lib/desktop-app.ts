/**
 * The desktop app (desktop/) shows this site with "PDFellaDesktop" in the user
 * agent. Pages then render as an app: see .app-only / .web-only in globals.css.
 *
 * Runs inline in <head> so the switch happens before first paint. On localhost,
 * ?app=desktop (and ?app=web) toggles it for the session, for testing.
 */
export const appModeScript = `try{var q=new URLSearchParams(location.search).get('app'),l=/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname);if(l&&q)sessionStorage.setItem('pdfella:app',q);if(navigator.userAgent.indexOf('PDFellaDesktop')>-1||(l&&sessionStorage.getItem('pdfella:app')==='desktop'))document.documentElement.dataset.app='desktop'}catch(e){}`;

const RECENT = "pdfella:recent-tools";

/** Tool slugs the user opened, most recent first. */
export function recentTools(): string[] {
  try { return (JSON.parse(localStorage.getItem(RECENT) ?? "[]") as string[]).slice(0, 6); } catch { return []; }
}

export function rememberTool(slug: string) {
  try { localStorage.setItem(RECENT, JSON.stringify([slug, ...recentTools().filter((s) => s !== slug)].slice(0, 6))); } catch { /* storage blocked */ }
}
