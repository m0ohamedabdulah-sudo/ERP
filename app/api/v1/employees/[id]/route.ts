import { withErrors } from "../../../../../lib/api-response";
import * as employeeController from "../../../../../modules/employees/employee.controller";

export const GET = withErrors(employeeController.get);
export const PATCH = withErrors(employeeController.update);
export const DELETE = withErrors(employeeController.remove);
