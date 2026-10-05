import { getJobs } from "@/lib/server/jobs";
import { getStore } from "@/lib/server/storage";
import { getQueue } from "@/lib/server/queue";
import { config } from "@/lib/server/config";
import { checkJobToken, callbackToken } from "@/lib/server/tokens";
import { OPS, ParamError } from "@/lib/server/ops";
import { sniffBytes } from "@/lib/security/filetype";
import { json, fail, sameOrigin } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Verify the uploads (existence, size, real content type), then enqueue.
 * Sensitive parameters (e.g. passwords) arrive here and go straight into the
 * task payload; they are never written to the job record.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!sameOrigin(req)) return fail(403, "forbidden", "Cross-origin request rejected");
  if (!checkJobToken(id, req.headers.get("authorization"))) return fail(401, "unauthorized", "Invalid token");
  const jobs = getJobs();
  const job = await jobs.get(id);
  if (!job) return fail(404, "not_found", "Job not found");
  if (job.status !== "UPLOADING") return fail(409, "already_started", "Job already started");
  if (job.expiresAt < Date.now()) return fail(410, "expired", "Job expired");

  const op = OPS[job.op];
  let taskParams: Record<string, unknown>;
  try {
    const body = await req.json().catch(() => ({}));
    taskParams = op.params((body?.params ?? {}) as Record<string, unknown>);
  } catch (e) {
    return fail(400, "bad_params", e instanceof ParamError ? e.message : "Invalid parameters");
  }

  const store = getStore();
  for (const input of job.inputs) {
    const size = await store.size(input.key);
    if (size === null) return fail(400, "missing_upload", "Upload not found");
    if (size > input.size * 1.01 + 1024) return fail(413, "too_large", "Upload larger than declared");
    // Never trust the extension: check the actual bytes.
    const kind = sniffBytes(await store.head(input.key, 4096), `x.${input.ext}`);
    if (!op.accepts.includes(kind)) {
      await store.deletePrefix(`tmp/${id}/`);
      await jobs.update(id, { status: "ERROR", error: { code: "bad_type", message: "Unsupported file type" } });
      return fail(415, "bad_type", "Unsupported file type");
    }
  }

  const outKey = `tmp/${id}/out.${op.output}`;
  await jobs.update(id, { status: "PROCESSING", progress: 0, output: { key: outKey, ext: op.output } });
  await getQueue().enqueue({
    jobId: id,
    op: job.op,
    params: taskParams,
    inputs: await Promise.all(job.inputs.map(async (i) => ({ url: await store.signedDownloadUrl(i.key, `input.${i.ext}`), ext: i.ext }))),
    output: { url: await store.signedUploadUrl(outKey, op.contentType, 4 * 1024 * 1024 * 1024), contentType: op.contentType, ext: op.output },
    callback: { url: `${config.appUrl}/api/jobs/${id}/callback`, token: callbackToken(id) },
  });
  return json({ jobId: id, status: "PROCESSING" }, 202);
}
