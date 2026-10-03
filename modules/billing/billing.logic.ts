/**
 * Billing pure logic (no Prisma, no I/O) — unit-testable without a DB.
 *
 * The service layer (billing.service.ts) fetches rows and maps them to
 * the plain shapes below; everything computed here is deterministic.
 *
 * Conventions:
 * - Money is plain `number` here (services convert Prisma Decimal via d2n).
 * - All date comparisons are date-only (time stripped) — billing works
 *   on calendar days, never timestamps.
 */

import { round2 } from "../../lib/decimal";

export type ServiceTypeV =
  | "STATIC_GUARD"
  | "BODYGUARD"
  | "EVENT_SECURITY"
  | "PATROL"
  | "CCTV_MONITORING";

export interface RateCandidate {
  id: string;
  contractSiteId: string;
  shiftId: string | null;
  positionId: string | null;
  /** Plain number — service converts Decimal via d2n(). */
  ratePerShift: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/** One present (countsAsPresent) attendance day, already resolved to a contract site. */
export interface AttendanceDay {
  date: Date;
  contractSiteId: string;
  shiftId: string | null;
  positionId: string | null;
  siteNameAr: string;
  siteNameEn: string;
  shiftName: string;
  serviceType: ServiceTypeV;
}

export interface DraftLine {
  descriptionAr: string;
  descriptionEn: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  contractSiteId: string;
  /** Traceability hint, e.g. "attendance:2026-08". */
  attendanceRef: string;
}

/** Strip time — billing compares calendar days. */
export function dayOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isRateEffective(rate: RateCandidate, date: Date): boolean {
  const day = dayOnly(date).getTime();
  if (dayOnly(rate.effectiveFrom).getTime() > day) return false;
  if (rate.effectiveTo && dayOnly(rate.effectiveTo).getTime() < day) return false;
  return true;
}

/**
 * Pick the most specific effective rate for one attendance day.
 * Specificity: shift match (2 pts) + position match (1 pt).
 * A null shiftId/positionId on the rate is a wildcard (0 pts, still eligible).
 * Ties break by earliest effectiveFrom, then by rate id (deterministic).
 */
export function pickRate(
  rates: RateCandidate[],
  contractSiteId: string,
  shiftId: string | null,
  positionId: string | null,
  date: Date,
): RateCandidate | null {
  let best: RateCandidate | null = null;
  let bestScore = -1;
  let bestFrom = Number.POSITIVE_INFINITY;
  let bestId = "";

  for (const r of rates) {
    if (r.contractSiteId !== contractSiteId) continue;
    if (!isRateEffective(r, date)) continue;
    if (r.shiftId !== null && r.shiftId !== shiftId) continue;
    if (r.positionId !== null && r.positionId !== positionId) continue;

    const score =
      (r.shiftId !== null && r.shiftId === shiftId ? 2 : 0) +
      (r.positionId !== null && r.positionId === positionId ? 1 : 0);
    const from = dayOnly(r.effectiveFrom).getTime();
    if (
      score > bestScore ||
      (score === bestScore &&
        (from < bestFrom || (from === bestFrom && r.id < bestId)))
    ) {
      best = r;
      bestScore = score;
      bestFrom = from;
      bestId = r.id;
    }
  }
  return best;
}

export interface BuiltLines {
  lines: DraftLine[];
  /** Days with no effective rate — surfaced to the caller, never silently dropped. */
  unpriced: AttendanceDay[];
}

/**
 * Group present days into invoice lines: one line per
 * (contractSite, shift, rate). Quantity = present day count.
 */
export function buildInvoiceLines(
  days: AttendanceDay[],
  rates: RateCandidate[],
  periodLabelAr: string,
  periodLabelEn: string,
  attendanceRef: string,
): BuiltLines {
  const groups = new Map<
    string,
    { day: AttendanceDay; rate: RateCandidate; quantity: number }
  >();
  const unpriced: AttendanceDay[] = [];

  for (const day of days) {
    const rate = pickRate(
      rates,
      day.contractSiteId,
      day.shiftId,
      day.positionId,
      day.date,
    );
    if (!rate) {
      unpriced.push(day);
      continue;
    }
    const key = `${day.contractSiteId}|${day.shiftId ?? "-"}|${rate.id}`;
    const g = groups.get(key);
    if (g) g.quantity += 1;
    else groups.set(key, { day, rate, quantity: 1 });
  }

  const lines: DraftLine[] = [...groups.values()].map(({ day, rate, quantity }) => {
    const unitPrice = round2(rate.ratePerShift);
    return {
      descriptionAr: `خدمات حراسة — ${day.siteNameAr} — وردية ${day.shiftName} — ${periodLabelAr}`,
      descriptionEn: `Guard services — ${day.siteNameEn} — ${day.shiftName} shift — ${periodLabelEn}`,
      quantity,
      unitPrice,
      amount: round2(quantity * unitPrice),
      contractSiteId: day.contractSiteId,
      attendanceRef,
    };
  });

  // Deterministic order: Arabic description.
  lines.sort((a, b) => a.descriptionAr.localeCompare(b.descriptionAr, "ar"));
  return { lines, unpriced };
}

export interface Totals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

/**
 * Totals: discount is applied first, tax is computed on the net
 * (subtotal − discount). taxRate is a fraction (e.g. 0.14 for 14% VAT).
 */
export function computeTotals(
  subtotal: number,
  discountAmount: number,
  taxRate: number,
): Totals {
  if (subtotal < 0 || discountAmount < 0 || taxRate < 0) {
    throw new Error("Totals inputs must be non-negative");
  }
  const sub = round2(subtotal);
  const disc = round2(Math.min(discountAmount, sub));
  const tax = round2((sub - disc) * taxRate);
  return {
    subtotal: sub,
    discountAmount: disc,
    taxAmount: tax,
    total: round2(sub - disc + tax),
  };
}

/** Document numbering: INV-2026-0001 / PAY-2026-0001. */
export function nextDocNumber(
  prefix: "INV" | "PAY",
  year: number,
  lastValue: number,
): string {
  if (!Number.isInteger(lastValue) || lastValue < 0) {
    throw new Error("lastValue must be a non-negative integer");
  }
  return `${prefix}-${year}-${String(lastValue + 1).padStart(4, "0")}`;
}

// ------------------------------------------------------------------
// Invoice status machine
// ------------------------------------------------------------------

export type InvoiceStatusV =
  | "DRAFT"
  | "ISSUED"
  | "SENT"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export type InvoiceTransition = "issue" | "send" | "cancel" | "recalculate";

const INVOICE_TRANSITIONS: Record<InvoiceStatusV, InvoiceTransition[]> = {
  DRAFT: ["issue", "cancel", "recalculate"],
  ISSUED: ["send", "cancel"],
  SENT: [],
  PARTIALLY_PAID: [],
  PAID: [],
  OVERDUE: [],
  CANCELLED: [],
};

export function assertInvoiceTransition(
  status: InvoiceStatusV,
  transition: InvoiceTransition,
): void {
  if (!INVOICE_TRANSITIONS[status].includes(transition)) {
    throw new Error(
      `INVALID_TRANSITION: cannot ${transition} an invoice with status ${status}`,
    );
  }
}

/** Status after recording a payment (paidTotal includes the new payment). */
export function statusAfterPayment(
  current: InvoiceStatusV,
  total: number,
  paidTotal: number,
): InvoiceStatusV {
  const remaining = round2(total - paidTotal);
  if (remaining <= 0) return "PAID";
  if (current === "DRAFT" || current === "CANCELLED" || current === "PAID") {
    throw new Error(
      `INVALID_STATUS: cannot record payment on ${current} invoice`,
    );
  }
  return "PARTIALLY_PAID";
}

/** An issued-family invoice past its due date is overdue. */
export function isOverdue(
  status: InvoiceStatusV,
  dueDate: Date | null,
  now: Date,
): boolean {
  if (!dueDate) return false;
  if (
    status !== "ISSUED" &&
    status !== "SENT" &&
    status !== "PARTIALLY_PAID"
  ) {
    return false;
  }
  return dayOnly(now).getTime() > dayOnly(dueDate).getTime();
}
