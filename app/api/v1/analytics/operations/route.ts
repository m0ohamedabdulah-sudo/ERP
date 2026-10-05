import { withErrors } from "../../../../../lib/api-response";
import * as analyticsController from "../../../../../modules/analytics/analytics.controller";

export const GET = withErrors(analyticsController.operations);
