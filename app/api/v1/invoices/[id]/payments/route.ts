import { withErrors } from "@/lib/api-response";
import * as controller from "@/modules/billing/billing.controller";

export const GET = withErrors(controller.listPayments);
export const POST = withErrors(controller.recordPayment);
