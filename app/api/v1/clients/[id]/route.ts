import { withErrors } from "../../../../../lib/api-response";
import * as clientController from "../../../../../modules/clients/client.controller";

export const GET = withErrors(clientController.get);
export const PUT = withErrors(clientController.update);
export const DELETE = withErrors(clientController.remove);
