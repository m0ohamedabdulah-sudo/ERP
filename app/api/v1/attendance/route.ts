import { withErrors } from "../../../../lib/api-response";
import * as attendanceController from "../../../../modules/attendance/attendance.controller";

export const GET = withErrors(attendanceController.board);
export const POST = withErrors(attendanceController.mark);
