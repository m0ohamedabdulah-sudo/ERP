import { withErrors } from "../../../../lib/api-response";
import * as adminController from "../../../../modules/admin/admin.controller";

export const GET = withErrors(adminController.auditLogs);
