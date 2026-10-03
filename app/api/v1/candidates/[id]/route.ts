import { withErrors } from "@/lib/api-response";
import { recruitmentController } from "@/modules/recruitment/recruitment.controller";

export const GET = withErrors(recruitmentController.get);
export const PATCH = withErrors(recruitmentController.update);
export const DELETE = withErrors(recruitmentController.remove);
