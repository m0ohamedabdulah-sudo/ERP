import { withErrors } from "../../../../../lib/api-response";
import * as adminController from "../../../../../modules/admin/admin.controller";

export const PATCH = withErrors(adminController.update);
