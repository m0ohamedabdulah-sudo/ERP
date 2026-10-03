import { withErrors } from "@/lib/api-response";
import { contractController } from "@/modules/contracts/contract.controller";

export const DELETE = withErrors(contractController.removeRate);
