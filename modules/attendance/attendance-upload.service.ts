import * as XLSX from "xlsx";
import { ApiError } from "../../lib/api-response";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../lib/audit";
import type { Actor } from "../../lib/auth";

/**
 * Bulk attendance import from an Excel file.
 *
 * Expected header row (aliases accepted, Arabic or English):
 *   nationalId | date (YYYY-MM-DD) | code (P, PP, 12, 6, A, X, AL, SL)
 * cardNumber may be used instead of nationalId.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_ERRORS = 50;

const HEADER_ALIASES: Record<string, string[]> = {
  nationalId: ["nationalid", "national_id", "nid", "الرقم القومي", "رقم قومي"],
  cardNumber: ["cardnumber", "card", "الكارت", "كارت"],
  date: ["date", "التاريخ", "اليوم"],
  code: ["code", "الكود", "الحضور", "الحالة"],
};

const CODE_ALIASES: Record<string, string> = {
  P: "P",
  PP: "PP",
  "12": "12",
  "1.5": "12",
  "6": "6",
  "0.5": "6",
  A: "A",
  ABSENT: "A",
  غياب: "A",
  X: "X",
  AL: "AL",
  SL: "SL",
  حاضر: "P",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface UploadResult {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

function normalizeHeader(h: unknown): string {
  return String(h ?? "").trim().toLowerCase();
}

function findColumn(headers: string[], field: string): number {
  const aliases = HEADER_ALIASES[field] ?? [];
  return headers.findIndex((h) => aliases.includes(h));
}

function excelDateToISO(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial date.
    const base = Date.UTC(1899, 11, 30);
    const d = new Date(base + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim().slice(0, 10);
  return DATE_RE.test(s) ? s : null;
}

export async function uploadAttendance(
  actor: Actor,
  siteId: string,
  file: File,
  req?: Request,
): Promise<UploadResult> {
  const site = await prisma.site.findFirst({
    where: { id: siteId, deletedAt: null },
  });
  if (!site) throw new ApiError("SITE_NOT_FOUND", "Site not found", 404);

  if (file.size > MAX_FILE_BYTES) {
    throw new ApiError("FILE_TOO_LARGE", "File must be under 5MB", 413);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buf, { type: "buffer" });
  } catch {
    throw new ApiError("BAD_FILE", "Could not parse the Excel file", 422);
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new ApiError("EMPTY_FILE", "The file has no sheets", 422);

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 2) {
    throw new ApiError("EMPTY_FILE", "The file has no data rows", 422);
  }
  if (rows.length - 1 > MAX_ROWS) {
    throw new ApiError(
      "TOO_MANY_ROWS",
      `At most ${MAX_ROWS} rows per upload`,
      422,
    );
  }

  const headers = (rows[0] as unknown[]).map(normalizeHeader);
  const idCol = findColumn(headers, "nationalId");
  const cardCol = findColumn(headers, "cardNumber");
  const dateCol = findColumn(headers, "date");
  const codeCol = findColumn(headers, "code");
  if (dateCol < 0 || codeCol < 0 || (idCol < 0 && cardCol < 0)) {
    throw new ApiError(
      "BAD_HEADERS",
      "Missing columns. Expected: nationalId (or cardNumber), date, code",
      422,
    );
  }

  const codes = await prisma.attendanceCode.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
  });
  const codeByValue = new Map<string, string>(codes.map((c) => [c.code as string, c.id]));

  const employees = await prisma.employee.findMany({
    where: { siteId: site.id, deletedAt: null },
    select: { id: true, nationalId: true, cardNumber: true },
  });
  const byNationalId = new Map(employees.map((e) => [e.nationalId.trim(), e.id]));
  const byCard = new Map(
    employees.map((e) => [e.cardNumber.trim().toLowerCase(), e.id]),
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const result: UploadResult = { imported: 0, skipped: 0, errors: [] };

  // Validate everything first; write only clean rows.
  const clean: { employeeId: string; date: Date; codeId: string }[] = [];
  rows.slice(1).forEach((raw, i) => {
    const rowNum = i + 2;
    const cells = raw as unknown[];
    const idVal = idCol >= 0 ? String(cells[idCol] ?? "").trim() : "";
    const cardVal = cardCol >= 0 ? String(cells[cardCol] ?? "").trim().toLowerCase() : "";
    const employeeId =
      (idVal && byNationalId.get(idVal)) ||
      (cardVal && byCard.get(cardVal)) ||
      null;
    if (!employeeId) {
      result.skipped += 1;
      if (result.errors.length < MAX_ERRORS) {
        result.errors.push({ row: rowNum, reason: "Unknown employee" });
      }
      return;
    }
    const dateStr = excelDateToISO(cells[dateCol]);
    if (!dateStr) {
      result.skipped += 1;
      if (result.errors.length < MAX_ERRORS) {
        result.errors.push({ row: rowNum, reason: "Bad date (use YYYY-MM-DD)" });
      }
      return;
    }
    if (dateStr > todayStr) {
      result.skipped += 1;
      if (result.errors.length < MAX_ERRORS) {
        result.errors.push({ row: rowNum, reason: "Future date" });
      }
      return;
    }
    const codeKey = String(cells[codeCol] ?? "").trim().toUpperCase();
    const codeValue = CODE_ALIASES[codeKey] ?? codeKey;
    const codeId = codeByValue.get(codeValue);
    if (!codeId) {
      result.skipped += 1;
      if (result.errors.length < MAX_ERRORS) {
        result.errors.push({ row: rowNum, reason: `Unknown code: ${codeKey}` });
      }
      return;
    }
    clean.push({ employeeId, date: new Date(dateStr + "T00:00:00Z"), codeId });
  });

  await prisma.$transaction(async (tx) => {
    for (const c of clean) {
      await tx.attendance.upsert({
        where: { employeeId_date: { employeeId: c.employeeId, date: c.date } },
        create: { employeeId: c.employeeId, siteId: site.id, date: c.date, codeId: c.codeId },
        update: { codeId: c.codeId },
      });
    }
    await writeAudit(
      tx,
      actor,
      {
        action: "attendance.upload",
        module: "attendance",
        recordId: site.id,
        newValue: { imported: clean.length, skipped: result.skipped },
      },
      req,
    );
  });

  result.imported = clean.length;
  return result;
}
