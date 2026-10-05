import { withErrors } from "../../../../../../lib/api-response";
import * as rosterController from "../../../../../../modules/roster/roster.controller";

export const POST = withErrors(rosterController.publish);
