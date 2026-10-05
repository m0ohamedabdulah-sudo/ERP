import { withErrors } from "../../../../../lib/api-response";
import * as rosterController from "../../../../../modules/roster/roster.controller";

export const PATCH = withErrors(rosterController.updateOneShift);
export const DELETE = withErrors(rosterController.deleteOneShift);
