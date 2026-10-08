import { withErrors } from "../../../../../../lib/api-response";
import * as operationsController from "../../../../../../modules/operations/operations.controller";

export const GET = withErrors(operationsController.siteQr);
