import { ApiError, ok, withErrors } from "../../../../../lib/api-response";
import { requirePermission } from "../../../../../lib/auth";
import { uploadAttendance } from "../../../../../modules/attendance/attendance-upload.service";

/** POST /api/v1/attendance/upload — multipart: file + siteId. */
async function upload(req: Request): Promise<Response> {
  const actor = await requirePermission(req, "attendance.edit");
  const form = await req.formData();
  const siteId = form.get("siteId");
  const file = form.get("file");
  if (typeof siteId !== "string" || !siteId) {
    throw new ApiError("VALIDATION_ERROR", "siteId is required", 422);
  }
  if (!(file instanceof File)) {
    throw new ApiError("VALIDATION_ERROR", "file is required", 422);
  }
  return ok(await uploadAttendance(actor, siteId, file, req));
}

export const POST = withErrors(upload);
