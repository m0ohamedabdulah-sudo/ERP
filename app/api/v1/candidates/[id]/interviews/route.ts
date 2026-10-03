import { withErrors } from "@/lib/api-response";
import { recruitmentController } from "@/modules/recruitment/recruitment.controller";

export const GET = withErrors(recruitmentController.listInterviews);
export const POST = withErrors(recruitmentController.scheduleInterview);
