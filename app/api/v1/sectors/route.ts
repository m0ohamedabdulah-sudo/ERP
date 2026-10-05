import { withErrors } from "../../../../lib/api-response";
import * as lookupController from "../../../../modules/lookups/lookup.controller";

export const GET = withErrors(lookupController.sectors);
export const POST = withErrors(lookupController.createSectorEndpoint);
