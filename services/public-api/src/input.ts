import { API_LIMITS, paramsOf, type ApiEndpoint, type ApiParam } from "@/lib/api/spec";
import { sniffBytes } from "@/lib/security/filetype";
import { ApiError } from "./errors";

export interface InputFile { name: string; bytes: Uint8Array; kind: "pdf" | "png" | "jpg" }
export type ParamValue = string | number | boolean;

export interface Input {
  files: Record<string, InputFile[]>;
  params: Record<string, ParamValue | undefined>;
}

/** Read a multipart request into typed files and params, validated against the endpoint's spec. */
export async function readInput(endpoint: ApiEndpoint, form: FormData): Promise<Input> {
  const files: Input["files"] = {};
  for (const f of endpoint.files) {
    const parts = form.getAll(f.name).filter((v): v is File => typeof v !== "string");
    // Accept `files[]` too: many HTTP clients append brackets for repeated fields.
    if (f.multiple) parts.push(...form.getAll(`${f.name}[]`).filter((v): v is File => typeof v !== "string"));
    if (!f.multiple && parts.length > 1) throw new ApiError("invalid_request", `Send a single \`${f.name}\`.`);
    const min = f.required ? (f.min ?? 1) : 0;
    if (parts.length < min) throw new ApiError("invalid_request", min > 1 ? `Send at least ${min} files as \`${f.name}\`.` : `\`${f.name}\` is required.`);
    if (parts.length > API_LIMITS.maxFiles) throw new ApiError("invalid_request", `Send at most ${API_LIMITS.maxFiles} files.`);
    files[f.name] = [];
    for (const part of parts) {
      if (part.size > API_LIMITS.maxFileBytes) throw new ApiError("too_large", `Each file must be ${API_LIMITS.maxFileBytes / 1024 / 1024} MB or smaller.`);
      const bytes = new Uint8Array(await part.arrayBuffer());
      // Trust the contents, never the name or declared type.
      const kind = sniffBytes(bytes.subarray(0, 64));
      if (!(f.accepts as readonly string[]).includes(kind)) {
        throw new ApiError("unsupported_type", `\`${f.name}\` must be ${f.accepts.map((a) => a.toUpperCase()).join(" or ")}.`);
      }
      files[f.name].push({ name: part.name || `${f.name}.${kind}`, bytes, kind: kind as InputFile["kind"] });
    }
  }

  const params: Input["params"] = {};
  for (const p of paramsOf(endpoint)) {
    const raw = form.get(p.name);
    if (raw !== null && typeof raw !== "string") throw new ApiError("invalid_request", `\`${p.name}\` must be a text field.`);
    params[p.name] = raw === null || raw.trim() === "" ? defaultFor(p) : parseParam(p, raw.trim());
  }
  return { files, params };
}

function defaultFor(p: ApiParam) {
  if (p.required) throw new ApiError("invalid_request", `\`${p.name}\` is required.`);
  return p.default;
}

function parseParam(p: ApiParam, raw: string): ParamValue {
  const bad = (why: string) => new ApiError("invalid_request", `\`${p.name}\` ${why}.`);
  let v: ParamValue;
  switch (p.type) {
    case "boolean":
      if (!["true", "false", "1", "0"].includes(raw.toLowerCase())) throw bad("must be true or false");
      return raw === "true" || raw === "1";
    case "integer":
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n) || (p.type === "integer" && !Number.isInteger(n))) throw bad(`must be ${p.type === "integer" ? "a whole number" : "a number"}`);
      if (p.min !== undefined && n < p.min) throw bad(`must be at least ${p.min}`);
      if (p.max !== undefined && n > p.max) throw bad(`must be at most ${p.max}`);
      v = n;
      break;
    }
    case "color":
      if (!/^#[0-9a-f]{6}$/i.test(raw)) throw bad("must be a colour like #1a2b3c");
      return raw.toLowerCase();
    case "pages":
      if (!/^[\d\s,-]+$/.test(raw)) throw bad("must be pages like 1-3,5,8-");
      return raw;
    default:
      if (raw.length > 2000) throw bad("is too long");
      v = raw;
  }
  if (p.enum && !p.enum.includes(String(v))) throw bad(`must be one of ${p.enum.join(", ")}`);
  return v;
}
