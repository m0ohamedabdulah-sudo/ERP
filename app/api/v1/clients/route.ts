import { withErrors } from "../../../../lib/api-response";
import * as clientController from "../../../../modules/clients/client.controller";

export const GET = withErrors(clientController.list);
export const POST = withErrors(clientController.create);
