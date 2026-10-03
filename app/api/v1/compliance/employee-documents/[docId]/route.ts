import { withErrors } from "@/lib/api-response";
import { complianceController } from "@/modules/compliance/compliance.controller";

export const PATCH = withErrors(complianceController.patchEmployeeDocument);
export const DELETE = withErrors(complianceController.deleteEmployeeDocument);
