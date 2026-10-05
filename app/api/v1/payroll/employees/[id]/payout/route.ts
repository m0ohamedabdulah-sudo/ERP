import { withErrors } from "../../../../../../../lib/api-response";
import * as payrollController from "../../../../../../../modules/payroll/payroll.controller";

export const PATCH = withErrors(payrollController.payout);
