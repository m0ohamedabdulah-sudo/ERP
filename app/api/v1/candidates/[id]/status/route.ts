import { withErrors } from "@/lib/api-response";
import { recruitmentController } from "@/modules/recruitment/recruitment.controller";

export const POST = withErrors(recruitmentController.transition);
