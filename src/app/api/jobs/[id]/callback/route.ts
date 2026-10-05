import { getJobs } from "@/lib/server/jobs";
import { getStore } from "@/lib/server/storage";
import { verify } from "@/lib/server/tokens";
import { json, fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const CODES = new Set(["wrong_password", "not_encrypted", "encrypted", "damaged", "unsupported", "timeout", "failed", "malware"]);

/** Status reports from the worker, authenticated by a per-job HMAC token. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!verify("callback", id, req.headers.get("x-worker-auth"))) return fail(401, "unauthorized", "Invalid worker token");
  const job = await getJobs().get(id);
  if (!job) return fail(404, "not_found", "Job not found");
  const body = (await req.json().catch(() => ({}))) as { status?: string; progress?: number; error?: { code?: string } };

  if (body.status === "PROGRESS") {
    await getJobs().update(id, { progress: Math.max(0, Math.min(100, Number(body.progress) || 0)) });
  } else if (body.status === "READY") {
    const size = job.output ? await getStore().size(job.output.key) : null;
    if (!job.output || size === null) return fail(400, "missing_output", "Output not uploaded");
    await getJobs().update(id, { status: "READY", progress: 100, output: { ...job.output, size } });
    // Inputs are no longer needed once the result exists.
    for (const i of job.inputs) await getStore().deletePrefix(i.key).catch(() => {});
  } else if (body.status === "ERROR") {
    const code = CODES.has(String(body.error?.code)) ? String(body.error!.code) : "failed";
    await getJobs().update(id, { status: "ERROR", error: { code, message: "Processing failed" } });
    await getStore().deletePrefix(`tmp/${id}/`).catch(() => {});
  } else {
    return fail(400, "bad_status", "Unknown status");
  }
  return json({ ok: true });
}
