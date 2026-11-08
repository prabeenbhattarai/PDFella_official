import { after } from "next/server";
import { githubInstaller, isDesktopOs, latestBuild } from "@/lib/desktop-downloads";
import { countDownload } from "@/lib/server/download-count";
import { clientIp } from "@/lib/server/http";
import { getLimiter } from "@/lib/server/ratelimit";
import { hashClient } from "@/lib/server/tokens";

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|curl|wget|python|headless/i;

/** /download/mac and /download/windows: count the download, then send the visitor to the newest installer on the CDN. */
export async function GET(req: Request, { params }: { params: Promise<{ os: string }> }) {
  const { os } = await params;
  if (!isDesktopOs(os)) return new Response("Not found", { status: 404 });
  const build = await latestBuild(os);
  if (!BOT.test(req.headers.get("user-agent") ?? "")) {
    // After the response, so counting never slows the download. Once per person per hour, so repeated clicks don't inflate it.
    after(async () => {
      try {
        const { ok } = await getLimiter().hit(`dl_${os}_${hashClient(clientIp(req))}`, 1, 3600);
        if (ok) await countDownload(os, build?.version ?? "unknown");
      } catch (e) {
        console.error("[download] not counted:", (e as Error).message);
      }
    });
  }
  return new Response(null, { status: 302, headers: { Location: build?.url ?? githubInstaller(os), "Cache-Control": "private, no-store" } });
}
