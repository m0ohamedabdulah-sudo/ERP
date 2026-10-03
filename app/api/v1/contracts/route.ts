import { withErrors } from "@/lib/api-response";
import { contractController } from "@/modules/contracts/contract.controller";

export const GET = withErrors(contractController.list);
export const POST = withErrors(contractController.create);
