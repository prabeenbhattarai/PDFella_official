import "server-only";
import { config } from "./config";
import type { ServerOp } from "../tools";

/** Message sent to the processing worker. The worker only ever receives signed URLs, never storage credentials. */
export interface WorkerTask {
  jobId: string;
  op: ServerOp;
  params: Record<string, unknown>;
  inputs: { url: string; ext: string }[];
  output: { url: string; contentType: string; ext: string };
  callback: { url: string; token: string };
}

export interface JobQueue { enqueue(task: WorkerTask): Promise<void> }

/** Development: call the worker directly (fire-and-forget). */
class DirectQueue implements JobQueue {
  async enqueue(task: WorkerTask) {
    fetch(`${config.workerUrl}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Worker-Auth": task.callback.token },
      body: JSON.stringify(task),
    }).catch(async (e) => {
      // Fail the job immediately so the browser stops waiting.
      console.error("[queue] worker unreachable", e?.message);
      const { getJobs } = await import("./jobs");
      await getJobs().update(task.jobId, { status: "ERROR", error: { code: "unavailable", message: "Processing service unavailable" } });
    });
  }
}

/** Production: Cloud Tasks → Cloud Run worker, authenticated with an OIDC token, with retries and rate limiting. */
class CloudTasksQueue implements JobQueue {
  async enqueue(task: WorkerTask) {
    const { CloudTasksClient } = await import("@google-cloud/tasks");
    const client = new CloudTasksClient();
    const parent = client.queuePath(config.gcp.project!, config.gcp.location, config.gcp.queue);
    await client.createTask({
      parent,
      task: {
        dispatchDeadline: { seconds: 600 },
        httpRequest: {
          httpMethod: "POST",
          url: `${config.workerUrl}/process`,
          headers: { "Content-Type": "application/json", "X-Worker-Auth": task.callback.token },
          body: Buffer.from(JSON.stringify(task)).toString("base64"),
          oidcToken: config.gcp.invokerServiceAccount ? { serviceAccountEmail: config.gcp.invokerServiceAccount, audience: config.workerUrl } : undefined,
        },
      },
    });
  }
}

let queue: JobQueue | null = null;
export function getQueue(): JobQueue {
  queue ??= config.queue === "cloudtasks" ? new CloudTasksQueue() : new DirectQueue();
  return queue;
}
