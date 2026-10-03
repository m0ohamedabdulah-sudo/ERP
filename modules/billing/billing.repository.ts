/**
 * Billing repository (modules/billing/billing.repository.ts).
 *
 * Prisma only — no business logic, no auth, no audit. All functions
 * accept the root client or a transaction client (`Db`).
 */

import type { InvoiceStatus, Prisma } from "@prisma/client";
import type { Db } from "../../lib/audit";
import { d2n } from "../../lib/decimal";

// ------------------------------------------------------------------
// Contracts (for billing)
// ------------------------------------------------------------------

export async function getContractForBilling(db: Db, contractId: string) {
  return db.contract.findUnique({
    where: { id: contractId },
    include: {
      client: true,
      sites: {
        include: {
          site: true,
          rates: true,
        },
      },
    },
  });
}

export type ContractForBillingRow = NonNullable<
  Awaited<ReturnType<typeof getContractForBilling>>
>;

// ------------------------------------------------------------------
// Attendance
// ------------------------------------------------------------------

/**
 * Present (countsAsPresent) attendance rows for the given sites and
 * date range. Includes employee.shift so the service can resolve
 * shiftId even when the attendance row itself has shiftId = null.
 */
export async function getPresentAttendance(
  db: Db,
  siteIds: string[],
  from: Date,
  to: Date,
) {
  return db.attendance.findMany({
    where: {
      siteId: { in: siteIds },
      date: { gte: from, lte: to },
      code: { countsAsPresent: true },
    },
    include: {
      code: true,
      shift: true,
      site: true,
      employee: { include: { shift: true } },
    },
    orderBy: { date: "asc" },
  });
}

export type PresentAttendanceRow = Awaited<
  ReturnType<typeof getPresentAttendance>
>[number];

// ------------------------------------------------------------------
// Sequences (document numbering)
// ------------------------------------------------------------------

/**
 * Transaction-safe sequence increment. Returns the new value; the
 * caller formats it via nextDocNumber("INV"|"PAY", year, value).
 * Must be called inside the same transaction that creates the document
 * so the number is never handed out twice.
 */
export async function nextSequence(db: Db, key: string): Promise<number> {
  const seq = await db.sequence.upsert({
    where: { key },
    create: { key, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });
  return seq.lastValue;
}

// ------------------------------------------------------------------
// Invoices
// ------------------------------------------------------------------

export interface CreateInvoiceLineInput {
  descriptionAr: string;
  descriptionEn: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  contractSiteId: string;
  attendanceRef: string;
}

export interface CreateInvoiceInput {
  invoiceNo: string;
  contractId: string;
  clientId: string;
  periodStart: Date;
  periodEnd: Date;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  lines: CreateInvoiceLineInput[];
}

export async function createInvoice(db: Db, data: CreateInvoiceInput) {
  return db.invoice.create({
    data: {
      invoiceNo: data.invoiceNo,
      contractId: data.contractId,
      clientId: data.clientId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      status: "DRAFT",
      subtotal: data.subtotal,
      discountAmount: data.discountAmount,
      taxAmount: data.taxAmount,
      total: data.total,
      lines: {
        create: data.lines.map((l) => ({
          descriptionAr: l.descriptionAr,
          descriptionEn: l.descriptionEn,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          amount: l.amount,
          contractSiteId: l.contractSiteId,
          attendanceRef: l.attendanceRef,
        })),
      },
    },
    include: { lines: true },
  });
}

/**
 * Delete all lines of an invoice and recreate them with new totals
 * (used by recalculate — invoiceNo and history are untouched).
 */
export async function replaceInvoiceLines(
  db: Db,
  invoiceId: string,
  lines: CreateInvoiceLineInput[],
  totals: {
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
  },
) {
  await db.invoiceLine.deleteMany({ where: { invoiceId } });
  return db.invoice.update({
    where: { id: invoiceId },
    data: {
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxAmount: totals.taxAmount,
      total: totals.total,
      lines: {
        create: lines.map((l) => ({
          descriptionAr: l.descriptionAr,
          descriptionEn: l.descriptionEn,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          amount: l.amount,
          contractSiteId: l.contractSiteId,
          attendanceRef: l.attendanceRef,
        })),
      },
    },
  });
}

export async function getInvoiceById(db: Db, id: string) {
  return db.invoice.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { paidAt: "asc" } },
      client: true,
      contract: true,
    },
  });
}

export type InvoiceDetailRow = NonNullable<
  Awaited<ReturnType<typeof getInvoiceById>>
>;

export interface InvoiceFilters {
  clientId?: string;
  contractId?: string;
  status?: InvoiceStatus;
  from?: Date;
  to?: Date;
  skip: number;
  take: number;
}

export async function listInvoices(db: Db, filters: InvoiceFilters) {
  const where: Prisma.InvoiceWhereInput = {};
  if (filters.clientId) where.clientId = filters.clientId;
  if (filters.contractId) where.contractId = filters.contractId;
  if (filters.status) where.status = filters.status;
  if (filters.from || filters.to) {
    where.periodStart = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  const [rows, total] = await Promise.all([
    db.invoice.findMany({
      where,
      skip: filters.skip,
      take: filters.take,
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          select: {
            id: true,
            companyNameAr: true,
            companyNameEn: true,
          },
        },
        contract: { select: { id: true, contractNo: true } },
      },
    }),
    db.invoice.count({ where }),
  ]);
  return { rows, total };
}

export type InvoiceListRow = Awaited<
  ReturnType<typeof listInvoices>
>["rows"][number];

export async function updateInvoiceStatus(
  db: Db,
  id: string,
  status: InvoiceStatus,
  extra?: Prisma.InvoiceUpdateInput,
) {
  return db.invoice.update({
    where: { id },
    data: { status, ...extra },
  });
}

// ------------------------------------------------------------------
// Payments
// ------------------------------------------------------------------

export interface CreatePaymentInput {
  paymentNo: string;
  invoiceId: string;
  amount: number;
  paidAt: Date;
  method: Prisma.PaymentCreateInput["method"];
  reference?: string | null;
  notes?: string | null;
}

export async function createPayment(db: Db, data: CreatePaymentInput) {
  return db.payment.create({
    data: {
      paymentNo: data.paymentNo,
      invoiceId: data.invoiceId,
      amount: data.amount,
      paidAt: data.paidAt,
      method: data.method,
      reference: data.reference ?? null,
      notes: data.notes ?? null,
    },
  });
}

/** Total paid against an invoice (plain number, 0 when none). */
export async function sumPayments(db: Db, invoiceId: string): Promise<number> {
  const agg = await db.payment.aggregate({
    where: { invoiceId },
    _sum: { amount: true },
  });
  return d2n(agg._sum.amount);
}

// ------------------------------------------------------------------
// E-invoice submissions (stub)
// ------------------------------------------------------------------

export async function createEinvoiceSubmission(db: Db, invoiceId: string) {
  return db.einvoiceSubmission.create({
    data: { invoiceId, status: "PENDING" },
  });
}

// ------------------------------------------------------------------
// Overdue sync
// ------------------------------------------------------------------

/**
 * Invoices in the issued family whose due date has passed.
 * `today` must be a date-only (local-midnight) Date.
 */
export async function findOverdueCandidates(db: Db, today: Date) {
  return db.invoice.findMany({
    where: {
      status: { in: ["ISSUED", "SENT", "PARTIALLY_PAID"] },
      dueDate: { lt: today },
    },
    select: { id: true, status: true },
  });
}
