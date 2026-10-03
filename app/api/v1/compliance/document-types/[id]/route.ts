import { withErrors } from "@/lib/api-response";
import { complianceController } from "@/modules/compliance/compliance.controller";

export const GET = withErrors(complianceController.getDocumentType);
export const PATCH = withErrors(complianceController.updateDocumentType);
export const DELETE = withErrors(complianceController.deleteDocumentType);
