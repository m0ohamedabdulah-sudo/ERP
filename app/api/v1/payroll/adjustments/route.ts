import { withErrors } from "../../../../../lib/api-response";
import * as payrollController from "../../../../../modules/payroll/payroll.controller";

export const GET = withErrors(payrollController.listAdj);
export const POST = withErrors(payrollController.createAdj);
