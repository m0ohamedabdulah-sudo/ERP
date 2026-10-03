import { withErrors } from "@/lib/api-response";
import { contractController } from "@/modules/contracts/contract.controller";

export const GET = withErrors(contractController.get);
export const PUT = withErrors(contractController.update);
export const DELETE = withErrors(contractController.remove);
