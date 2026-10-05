import { withErrors } from "../../../../../lib/api-response";
import * as rosterController from "../../../../../modules/roster/roster.controller";

export const GET = withErrors(rosterController.get);
export const DELETE = withErrors(rosterController.remove);
