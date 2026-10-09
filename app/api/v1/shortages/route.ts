import { withErrors } from "../../../../lib/api-response";
import { list } from "../../../../modules/shortage/shortage.controller";

/** GET /api/v1/shortages — shortage engine report (per site × shift). */
export const GET = withErrors(list);
