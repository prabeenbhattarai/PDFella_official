import { API_BASE_URL, API_VERSION, ENDPOINTS, ERROR_CODES, paramsOf, type ApiParam } from "@/lib/api/spec";
import { brand } from "@/lib/brand";

/** OpenAPI 3.1 document generated from lib/api/spec.ts (importable into Postman, Insomnia, code generators). */
export function openApiDocument(serverUrl = API_BASE_URL) {
  const schemaFor = (p: ApiParam) => ({
    type: p.type === "pages" || p.type === "color" ? "string" : p.type,
    description: p.description,
    ...(p.enum ? { enum: p.type === "integer" ? p.enum.map(Number) : p.enum } : {}),
    ...(p.default !== undefined ? { default: p.default } : {}),
    ...(p.min !== undefined ? { minimum: p.min } : {}),
    ...(p.max !== undefined ? { maximum: p.max } : {}),
    ...(p.example !== undefined ? { examples: [p.example] } : {}),
    ...(p.type === "color" ? { pattern: "^#[0-9a-fA-F]{6}$" } : {}),
  });
  const binary = { type: "string", format: "binary" };
  const errorRef = { $ref: "#/components/responses/Error" };

  const paths = Object.fromEntries(ENDPOINTS.map((e) => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const f of e.files) {
      properties[f.name] = f.multiple ? { type: "array", items: binary, description: f.description, ...(f.min ? { minItems: f.min } : {}) } : { ...binary, description: f.description };
      if (f.required) required.push(f.name);
    }
    for (const p of paramsOf(e)) {
      properties[p.name] = schemaFor(p);
      if (p.required) required.push(p.name);
    }
    return [`/${API_VERSION}${e.path}`, {
      post: {
        operationId: e.id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()),
        summary: e.title,
        description: e.summary,
        tags: [e.group],
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", properties, required } } } },
        responses: {
          200: { description: e.returns.description, content: { [e.returns.contentType.split(";")[0]]: { schema: e.returns.contentType.startsWith("text/") ? { type: "string" } : binary } } },
          400: errorRef, 401: errorRef, 413: errorRef, 415: errorRef, 422: errorRef, 429: errorRef,
        },
      },
    }];
  }));

  return {
    openapi: "3.1.0",
    info: {
      title: `${brand.name} API`,
      version: API_VERSION,
      description: `Process PDFs with the same engine as ${brand.name}. Send files as multipart/form-data; the result is returned in the response body.\n\nErrors:\n${ERROR_CODES.map((c) => `- \`${c.code}\` (${c.status}): ${c.description}`).join("\n")}`,
    },
    servers: [{ url: serverUrl }],
    security: [{ apiKey: [] }],
    tags: [...new Set(ENDPOINTS.map((e) => e.group))].map((name) => ({ name })),
    paths: {
      [`/${API_VERSION}/me`]: {
        get: {
          operationId: "me", summary: "Key details and usage", tags: ["Account"],
          description: "The key's name, rate limit and request counts for the last 30 days.",
          responses: { 200: { description: "Key details.", content: { "application/json": { schema: { type: "object" } } } }, 401: errorRef },
        },
      },
      ...paths,
    },
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: "Your API key: `Authorization: Bearer pdfella_sk_…`" } },
      responses: {
        Error: {
          description: "Error",
          content: { "application/json": { schema: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string", enum: ERROR_CODES.map((c) => c.code) }, message: { type: "string" } }, required: ["code", "message"] } } } } },
        },
      },
    },
  };
}
