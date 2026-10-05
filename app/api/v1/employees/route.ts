import { withErrors } from "../../../../lib/api-response";
import * as employeeController from "../../../../modules/employees/employee.controller";

export const GET = withErrors(employeeController.list);
export const POST = withErrors(employeeController.create);
