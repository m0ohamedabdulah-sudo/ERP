import { withErrors } from "@/lib/api-response";
import { complianceController } from "@/modules/compliance/compliance.controller";

export const GET = withErrors(complianceController.listDocumentTypes);
export const POST = withErrors(complianceController.createDocumentType);
