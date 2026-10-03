import { withErrors } from "@/lib/api-response";
import { complianceController } from "@/modules/compliance/compliance.controller";

export const PATCH = withErrors(complianceController.patchCandidateDocument);
export const DELETE = withErrors(complianceController.deleteCandidateDocument);
