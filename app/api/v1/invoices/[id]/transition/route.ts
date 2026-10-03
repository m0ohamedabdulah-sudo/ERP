import { withErrors } from "@/lib/api-response";
import * as controller from "@/modules/billing/billing.controller";

export const POST = withErrors(controller.transition);
