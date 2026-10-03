import { ApiError } from "./api-response";

/**
 * Read a dynamic route param in a version-tolerant way.
 * Next 14 passes `params` as an object; Next 15 passes a Promise.
 */
export async function routeParam(
  ctx: unknown,
  name: string,
): Promise<string> {
  const raw = (ctx as { params?: unknown } | undefined)?.params;
  const params =
    raw !== null &&
    typeof raw === "object" &&
    typeof (raw as Promise<unknown>).then === "function"
      ? await raw
      : raw;
  const value = (params as Record<string, string | undefined> | undefined)?.[
    name
  ];
  if (!value) {
    throw new ApiError("VALIDATION_ERROR", `Missing route param: ${name}`, 422);
  }
  return value;
}
