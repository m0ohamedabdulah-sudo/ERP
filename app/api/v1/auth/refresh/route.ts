import { withErrors } from "../../../../../lib/api-response";
import * as authController from "../../../../../modules/auth/auth.controller";

export const POST = withErrors(authController.refresh);
