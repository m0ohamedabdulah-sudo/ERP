import { withErrors } from "../../../../../lib/api-response";
import * as siteController from "../../../../../modules/sites/site.controller";

export const GET = withErrors(siteController.get);
export const PATCH = withErrors(siteController.update);
export const DELETE = withErrors(siteController.remove);
