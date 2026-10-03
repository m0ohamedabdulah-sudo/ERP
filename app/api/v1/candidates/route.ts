import { withErrors } from "@/lib/api-response";
import { recruitmentController } from "@/modules/recruitment/recruitment.controller";

export const GET = withErrors(recruitmentController.list);
export const POST = withErrors(recruitmentController.create);
