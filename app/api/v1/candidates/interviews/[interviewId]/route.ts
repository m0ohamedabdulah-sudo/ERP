import { withErrors } from "@/lib/api-response";
import { recruitmentController } from "@/modules/recruitment/recruitment.controller";

export const PATCH = withErrors(recruitmentController.updateInterview);
export const DELETE = withErrors(recruitmentController.deleteInterview);
