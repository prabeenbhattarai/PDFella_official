import { getLocalStore } from "@/lib/server/storage";
import { signBlob, verify } from "@/lib/server/tokens";
import { fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Local-development stand-in for GCS signed URLs. Disabled when using cloud storage. */
function check(req: Request, key: string, method: "GET" | "PUT") {
  const u = new URL(req.url);
  const e = Number(u.searchParams.get("e"));
  const m = Number(u.searchParams.get("m") ?? 0);
  if (!e || e < Date.now()) return null;
  if (!verify("blob", `${method}:${key}:${e}:${m}`, u.searchParams.get("s"))) return null;
  void signBlob;
  return { maxBytes: m, name: u.searchParams.get("n") };
}

export async function PUT(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const store = getLocalStore();
  if (!store) return fail(404, "not_found", "Not found");
  const key = (await params).key.join("/");
  const ok = check(req, key, "PUT");
  if (!ok) return fail(403, "forbidden", "Invalid or expired signature");
  const data = new Uint8Array(await req.arrayBuffer());
  if (ok.maxBytes && data.length > ok.maxBytes) return fail(413, "too_large", "Too large");
  await store.write(key, data);
  return new Response(null, { status: 200 });
}

export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const store = getLocalStore();
  if (!store) return fail(404, "not_found", "Not found");
  const key = (await params).key.join("/");
  const ok = check(req, key, "GET");
  if (!ok) return fail(403, "forbidden", "Invalid or expired signature");
  try {
    const data = await store.read(key);
    const name = (ok.name ?? "file").replace(/[^\w.-]/g, "_");
    return new Response(new Uint8Array(data), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  } catch {
    return fail(404, "not_found", "Not found");
  }
}
