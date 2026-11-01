import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { API_LIMITS, API_VERSION, ENDPOINTS, PROCESS_PATH, endpointById, type ApiEndpoint } from "@/lib/api/spec";
import { ApiError } from "./errors";
import { readInput } from "./input";
import { hashKey, keyStore, looksLikeKey, type ApiKey } from "./keys";
import { openApiDocument } from "./openapi";
import { OPERATIONS } from "./operations";

type Env = { Variables: { key: ApiKey } };

const BUILD = process.env.BUILD_ID || "dev";

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

/** Sliding one-minute window per key, per instance. */
const hits = new Map<string, number[]>();
function rateLimit(key: ApiKey): { limit: number; remaining: number; retryAfter?: number } {
  const limit = key.ratePerMinute ?? API_LIMITS.defaultRatePerMinute;
  const now = Date.now();
  const recent = (hits.get(key.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= limit) return { limit, remaining: 0, retryAfter: Math.ceil((recent[0] + 60_000 - now) / 1000) };
  recent.push(now);
  hits.set(key.id, recent);
  return { limit, remaining: limit - recent.length };
}

export function createApp() {
  const app = new Hono<Env>();
  const v = `/${API_VERSION}`;

  app.use("*", async (c, next) => {
    const started = Date.now();
    await next();
    c.header("X-PDFella-API-Version", API_VERSION);
    c.header("X-PDFella-Build", BUILD);
    c.header("Cache-Control", "no-store");
    // One line per request, no file names or contents.
    console.log(JSON.stringify({ t: new Date().toISOString(), method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - started, key: c.get("key")?.id }));
  });

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      for (const [k, val] of Object.entries(err.headers)) c.header(k, val);
      return c.json(errorBody(err.code, err.message), err.status as 400);
    }
    console.error(JSON.stringify({ t: new Date().toISOString(), path: c.req.path, error: String((err as Error)?.stack ?? err).slice(0, 2000) }));
    return c.json(errorBody("internal", "Something went wrong on our side."), 500);
  });
  app.notFound((c) => c.json(errorBody("not_found", "No such endpoint. See /v1/openapi.json."), 404));

  // ───────── public
  app.get("/", (c) => c.redirect(`${v}/openapi.json`));
  app.get(`${v}/health`, (c) => c.json({ ok: true, version: API_VERSION, build: BUILD }));
  app.get(`${v}/openapi.json`, (c) => c.json(openApiDocument(new URL(c.req.url).origin)));

  // ───────── authenticated
  app.use(`${v}/*`, async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
    if (!looksLikeKey(token)) throw new ApiError("unauthorized", "Send your API key as `Authorization: Bearer pdfella_sk_…`.");
    const key = await keyStore().findByHash(hashKey(token));
    if (!key) throw new ApiError("unauthorized", "This API key isn't valid.");
    if (key.revokedAt) throw new ApiError("key_revoked", "This API key has been revoked.");
    c.set("key", key);
    const rl = rateLimit(key);
    c.header("X-RateLimit-Limit", String(rl.limit));
    c.header("X-RateLimit-Remaining", String(rl.remaining));
    if (rl.retryAfter !== undefined) throw new ApiError("rate_limited", `Rate limit is ${rl.limit} requests per minute.`, { "Retry-After": String(rl.retryAfter) });
    await next();
  });

  app.get(`${v}/me`, async (c) => {
    const key = c.get("key");
    const usage = await keyStore().usage(key.id, 30);
    return c.json({
      id: key.id, name: key.name, prefix: key.prefix, createdAt: key.createdAt,
      ratePerMinute: key.ratePerMinute ?? API_LIMITS.defaultRatePerMinute,
      usage: usage.sort((a, b) => b.date.localeCompare(a.date)).map(({ date, requests, errors, endpoints }) => ({ date, requests, errors, endpoints })),
    });
  });

  const limit = bodyLimit({ maxSize: API_LIMITS.maxRequestBytes, onError: () => { throw new ApiError("too_large", `Requests must be ${API_LIMITS.maxRequestBytes / 1024 / 1024} MB or smaller.`); } });

  /**
   * Runs one tool. `pick` chooses the endpoint from the parsed form, so the same
   * code serves both /v1/<tool> and the single /v1/process endpoint.
   */
  const handle = (pick: (form: FormData) => ApiEndpoint) => async (c: Context<Env>) => {
    const key = c.get("key");
    const bytesIn = Number(c.req.header("content-length") ?? 0);
    let tool = "unknown";
    let ok = false;
    try {
      if (!(c.req.header("content-type") ?? "").startsWith("multipart/form-data")) {
        throw new ApiError("invalid_request", "Send files as multipart/form-data.");
      }
      const form = await c.req.formData().catch(() => { throw new ApiError("invalid_request", "The multipart body couldn't be read."); });
      const endpoint = pick(form);
      tool = endpoint.id;
      const out = await OPERATIONS[endpoint.id](await readInput(endpoint, form));
      ok = true;
      return c.body(out.bytes as Uint8Array<ArrayBuffer>, 200, {
        "Content-Type": out.contentType,
        "Content-Disposition": `attachment; filename="${out.fileName}"`,
        "Content-Length": String(out.bytes.length),
        "X-PDFella-Tool": endpoint.id,
      });
    } finally {
      // Metering must never fail the request.
      keyStore().recordUsage(key.id, tool, ok, bytesIn).catch((e) => console.error("usage", String(e)));
    }
  };

  // One endpoint for every tool: the `tool` field picks which.
  app.post(`${v}${PROCESS_PATH}`, limit, handle((form) => {
    const tool = form.get("tool");
    if (typeof tool !== "string" || !tool.trim()) throw new ApiError("invalid_request", `\`tool\` is required: one of ${ENDPOINTS.map((e) => e.id).join(", ")}.`);
    const endpoint = endpointById(tool.trim());
    if (!endpoint) throw new ApiError("invalid_request", `Unknown \`tool\` "${tool.slice(0, 40)}". Use one of ${ENDPOINTS.map((e) => e.id).join(", ")}.`);
    return endpoint;
  }));

  // The same tools at their own paths (kept for v1 compatibility).
  for (const endpoint of ENDPOINTS) {
    if (!OPERATIONS[endpoint.id]) throw new Error(`No operation for endpoint ${endpoint.id}`);
    app.post(`${v}${endpoint.path}`, limit, handle(() => endpoint));
  }

  return app;
}
