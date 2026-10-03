/**
 * Consistent JSON envelope for all API responses (docs/API.md).
 *
 * Success: { success: true, data, meta: { generatedAt, ... } }
 * Error:   { success: false, error: { code, message, details? } }
 */

export interface ApiMeta {
  generatedAt: string;
  [key: string]: unknown;
}

function meta(extra?: Record<string, unknown>): ApiMeta {
  return { generatedAt: new Date().toISOString(), ...(extra ?? {}) };
}

export function ok<T>(
  data: T,
  extraMeta?: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(
    { success: true, data, meta: meta(extraMeta) },
    { status },
  );
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginated<T>(
  data: T[],
  page: PageMeta,
  extraMeta?: Record<string, unknown>,
): Response {
  return Response.json(
    { success: true, data, meta: meta({ ...extraMeta, ...page }) },
    { status: 200 },
  );
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function fail(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
): Response {
  return Response.json(
    {
      success: false,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
    },
    { status },
  );
}

/**
 * Wrap a route handler: maps ApiError → fail(), ZodError → 422,
 * unexpected errors → 500 (message hidden in production).
 */
export function withErrors(
  handler: (req: Request, ctx?: unknown) => Promise<Response>,
): (req: Request, ctx?: unknown) => Promise<Response> {
  return async (req: Request, ctx?: unknown) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.code, err.message, err.status, err.details);
      }
      if (err !== null && typeof err === "object" && "issues" in err) {
        // ZodError (avoid importing zod here to keep this module light).
        return fail(
          "VALIDATION_ERROR",
          "Invalid request payload",
          422,
          (err as { issues: unknown }).issues,
        );
      }
      console.error("[api] unhandled error", err);
      const message =
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err instanceof Error
            ? err.message
            : "Internal server error";
      return fail("INTERNAL_ERROR", message, 500);
    }
  };
}
