import { withErrors } from "../../../../lib/api-response";
import * as siteController from "../../../../modules/sites/site.controller";

export const GET = withErrors(siteController.list);
export const POST = withErrors(siteController.create);
