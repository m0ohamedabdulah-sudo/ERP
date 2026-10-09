import { withErrors } from "../../../../../lib/api-response";
import { replacements } from "../../../../../modules/shortage/shortage.controller";

/** GET /api/v1/shortages/replacements — eligible replacement candidates. */
export const GET = withErrors(replacements);
