import { withErrors } from "@/lib/api-response";
import * as controller from "@/modules/billing/billing.controller";

export const GET = withErrors(controller.list);
export const POST = withErrors(controller.generate);
