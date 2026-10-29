import { ERROR_CODES } from "@/lib/api/spec";

export type ErrorCode = (typeof ERROR_CODES)[number]["code"];

/** An error the client caused or should know about. `message` is shown to API users verbatim. */
export class ApiError extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message: string, readonly headers: Record<string, string> = {}) {
    super(message);
    this.status = ERROR_CODES.find((e) => e.code === code)?.status ?? 500;
  }
}
