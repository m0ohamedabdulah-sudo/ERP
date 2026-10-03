/**
 * Billing service (modules/billing/billing.service.ts).
 *
 * Orchestrates repository calls + pure logic from billing.logic.ts and
 * writes audit rows. No auth here (controller enforces permissions),
 * no Prisma queries here (repository only).
 *
 * DTO conventions:
 * - money → plain numbers via d2n()
 * - date-only fields (periodStart/periodEnd/dueDate/paidAt) → "YYYY-MM-DD"
 * - timestamps (issuedAt/createdAt/updatedAt) → ISO strings
 */

import type { InvoiceStatus, PaymentMethod, Prisma } from "@prisma/client";
import { ApiError } from "../../lib/api-response";
import { writeAudit } from "../../lib/audit";
import type { Actor } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { d2n, round2 } from "../../lib/decimal";
import {
  assertInvoiceTransition,
  buildInvoiceLines,
  computeTotals,
  dayOnly,
  isOverdue,
  nextDocNumber,
  statusAfterPayment,
  type AttendanceDay,
  type DraftLine,
  type InvoiceStatusV,
  type InvoiceTransition,
  type RateCandidate,
  type ServiceTypeV,
  type Totals,
} from "./billing.logic";
import { parseDateOnly } from "./billing.schema";
import {
  createEinvoiceSubmission,
  createInvoice,
  createPayment,
  findOverdueCandidates,
  getContractForBilling,
  getInvoiceById,
  getPresentAttendance,
  listInvoices as repoListInvoices,
  nextSequence,
  replaceInvoiceLines,
  sumPayments,
  updateInvoiceStatus,
  type ContractForBillingRow,
  type InvoiceDetailRow,
} from "./billing.repository";
import type {
  GenerateInvoiceInput,
  InvoiceQueryInput,
  RecordPaymentInput,
} from "./billing.schema";

// ------------------------------------------------------------------
// DTO helpers
// ------------------------------------------------------------------

export function dateOnlyString(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const isoDT = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

const isoDate = (d: Date | null | undefined): string | null =>
  d ? dateOnlyString(d) : null;

export interface InvoiceLineDto {
  id: string;
  descriptionAr: string;
  descriptionEn: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  contractSiteId: string | null;
  attendanceRef: string | null;
}

export interface PaymentDto {
  id: string;
  paymentNo: string;
  amount: number;
  paidAt: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface InvoiceDto {
  id: string;
  invoiceNo: string;
  contract: { id: string; contractNo: string };
  client: { id: string; companyNameAr: string; companyNameEn: string };
  periodStart: string;
  periodEnd: string;
  status: InvoiceStatus;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paidTotal: number;
  remaining: number;
  issuedAt: string | null;
  dueDate: string | null;
  lines: InvoiceLineDto[];
  payments: PaymentDto[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceListDto {
  id: string;
  invoiceNo: string;
  contract: { id: string; contractNo: string };
  client: { id: string; companyNameAr: string; companyNameEn: string };
  periodStart: string;
  periodEnd: string;
  status: InvoiceStatus;
  total: number;
  issuedAt: string | null;
  dueDate: string | null;
  createdAt: string;
  // Note: paidTotal / remaining are NOT computed on list rows (kept light);
  // they are available on the invoice detail DTO.
}

function toPaymentDto(
  p: InvoiceDetailRow["payments"][number],
): PaymentDto {
  return {
    id: p.id,
    paymentNo: p.paymentNo,
    amount: d2n(p.amount),
    paidAt: dateOnlyString(p.paidAt),
    method: p.method,
    reference: p.reference,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
  };
}

function toInvoiceDto(inv: InvoiceDetailRow): InvoiceDto {
  const total = d2n(inv.total);
  const paidTotal = round2(
    inv.payments.reduce((s, p) => s + d2n(p.amount), 0),
  );
  return {
    id: inv.id,
    invoiceNo: inv.invoiceNo,
    contract: { id: inv.contract.id, contractNo: inv.contract.contractNo },
    client: {
      id: inv.client.id,
      companyNameAr: inv.client.companyNameAr,
      companyNameEn: inv.client.companyNameEn,
    },
    periodStart: dateOnlyString(inv.periodStart),
    periodEnd: dateOnlyString(inv.periodEnd),
    status: inv.status,
    subtotal: d2n(inv.subtotal),
    discountAmount: d2n(inv.discountAmount),
    taxAmount: d2n(inv.taxAmount),
    total,
    paidTotal,
    remaining: round2(total - paidTotal),
    issuedAt: isoDT(inv.issuedAt),
    dueDate: isoDate(inv.dueDate),
    lines: inv.lines.map((l) => ({
      id: l.id,
      descriptionAr: l.descriptionAr,
      descriptionEn: l.descriptionEn,
      quantity: d2n(l.quantity),
      unitPrice: d2n(l.unitPrice),
      amount: d2n(l.amount),
      contractSiteId: l.contractSiteId,
      attendanceRef: l.attendanceRef,
    })),
    payments: inv.payments.map(toPaymentDto),
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  };
}

function toInvoiceListDto(
  row: Awaited<ReturnType<typeof repoListInvoices>>["rows"][number],
): InvoiceListDto {
  return {
    id: row.id,
    invoiceNo: row.invoiceNo,
    contract: { id: row.contract.id, contractNo: row.contract.contractNo },
    client: {
      id: row.client.id,
      companyNameAr: row.client.companyNameAr,
      companyNameEn: row.client.companyNameEn,
    },
    periodStart: dateOnlyString(row.periodStart),
    periodEnd: dateOnlyString(row.periodEnd),
    status: row.status,
    total: d2n(row.total),
    issuedAt: isoDT(row.issuedAt),
    dueDate: isoDate(row.dueDate),
    createdAt: row.createdAt.toISOString(),
  };
}

/** billing.logic throws plain Errors; convert to ApiError(409). */
function guardTransition(status: InvoiceStatusV, t: InvoiceTransition): void {
  try {
    assertInvoiceTransition(status, t);
  } catch (e) {
    throw new ApiError(
      "INVALID_INVOICE_TRANSITION",
      e instanceof Error ? e.message : "Invalid invoice transition",
      409,
    );
  }
}

// ------------------------------------------------------------------
// Draft generation internals (shared by generate + recalculate)
// ------------------------------------------------------------------

function assertPeriodWithinContract(
  contract: ContractForBillingRow,
  periodStart: Date,
  periodEnd: Date,
): void {
  const cStart = dayOnly(contract.startDate).getTime();
  const cEnd = dayOnly(contract.endDate).getTime();
  if (
    dayOnly(periodStart).getTime() < cStart ||
    dayOnly(periodEnd).getTime() > cEnd
  ) {
    throw new ApiError(
      "INVOICE_PERIOD_OUT_OF_CONTRACT",
      "Billing period must lie within the contract start/end dates",
      422,
      {
        periodStart: dateOnlyString(periodStart),
        periodEnd: dateOnlyString(periodEnd),
        contractStart: dateOnlyString(contract.startDate),
        contractEnd: dateOnlyString(contract.endDate),
      },
    );
  }
}

interface DraftBuild {
  lines: DraftLine[];
  subtotal: number;
  dayCount: number;
}

/**
 * Load contract rates + present attendance and group days into draft
 * lines via buildInvoiceLines(). Throws UNPRICED_ATTENDANCE (422)
 * when any present day has no effective rate — days are never dropped.
 */
async function buildDraft(
  contract: ContractForBillingRow,
  periodStart: Date,
  periodEnd: Date,
): Promise<DraftBuild> {
  const contractSites = contract.sites;
  // A (contract, site) pair can hold several ContractSite rows (different
  // service types). Attendance days resolve to the first contract site of
  // their site; rates still match per shift/position specificity.
  const siteIdToCs = new Map<string, (typeof contractSites)[number]>();
  for (const cs of contractSites) {
    if (!siteIdToCs.has(cs.siteId)) siteIdToCs.set(cs.siteId, cs);
  }

  const rates: RateCandidate[] = contractSites.flatMap((cs) =>
    cs.rates.map((r) => ({
      id: r.id,
      contractSiteId: r.contractSiteId,
      shiftId: r.shiftId,
      positionId: r.positionId,
      ratePerShift: d2n(r.ratePerShift),
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    })),
  );

  const attendance = await getPresentAttendance(
    prisma,
    contractSites.map((cs) => cs.siteId),
    periodStart,
    periodEnd,
  );

  const days: AttendanceDay[] = [];
  for (const a of attendance) {
    const cs = siteIdToCs.get(a.siteId);
    if (!cs) continue; // out-of-contract site: not billable on this contract
    days.push({
      date: a.date,
      contractSiteId: cs.id,
      // Seed/demo attendance rows carry shiftId = null; fall back to the
      // employee's assigned shift so shift-specific rates can match.
      shiftId: a.shiftId ?? a.employee.shiftId ?? null,
      positionId: a.employee.positionId ?? null,
      // Site has a single display name — used for both Ar/En labels.
      siteNameAr: a.site.name,
      siteNameEn: a.site.name,
      shiftName: a.shift?.name ?? a.employee.shift?.name ?? "—",
      serviceType: cs.serviceType as ServiceTypeV,
    });
  }

  const labelAr = new Intl.DateTimeFormat("ar-EG", {
    month: "long",
    year: "numeric",
  }).format(periodStart);
  const labelEn = new Intl.DateTimeFormat("en-EG", {
    month: "long",
    year: "numeric",
  }).format(periodStart);
  const ref = `attendance:${periodStart.getFullYear()}-${String(
    periodStart.getMonth() + 1,
  ).padStart(2, "0")}`;

  const { lines, unpriced } = buildInvoiceLines(
    days,
    rates,
    labelAr,
    labelEn,
    ref,
  );
  if (unpriced.length > 0) {
    throw new ApiError(
      "UNPRICED_ATTENDANCE",
      `${unpriced.length} present attendance day(s) have no effective contract rate`,
      422,
      {
        count: unpriced.length,
        sample: unpriced.slice(0, 5).map((d) => ({
          date: dateOnlyString(d.date),
          site: d.siteNameEn,
          shift: d.shiftName,
        })),
      },
    );
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  return { lines, subtotal, dayCount: days.length };
}

async function requireContractForBilling(
  contractId: string,
): Promise<ContractForBillingRow> {
  const contract = await getContractForBilling(prisma, contractId);
  if (!contract) {
    throw new ApiError("INVOICE_CONTRACT_NOT_FOUND", "Contract not found", 404);
  }
  return contract;
}

async function requireInvoiceDetail(id: string): Promise<InvoiceDetailRow> {
  const invoice = await getInvoiceById(prisma, id);
  if (!invoice) {
    throw new ApiError("INVOICE_NOT_FOUND", "Invoice not found", 404);
  }
  return invoice;
}

// ------------------------------------------------------------------
// Public service functions
// ------------------------------------------------------------------

/**
 * Generate a DRAFT invoice from present attendance inside the billing
 * period. Throws 404 (contract missing), 409 (contract not ACTIVE),
 * 422 (period outside contract / unpriced attendance days).
 */
export async function generateDraftInvoice(
  actor: Actor,
  input: GenerateInvoiceInput,
  req?: Request,
): Promise<InvoiceDto> {
  const contract = await requireContractForBilling(input.contractId);
  if (contract.status !== "ACTIVE") {
    throw new ApiError(
      "INVOICE_CONTRACT_NOT_ACTIVE",
      `Cannot bill against contract ${contract.contractNo} with status ${contract.status}`,
      409,
    );
  }
  assertPeriodWithinContract(contract, input.periodStart, input.periodEnd);

  const build = await buildDraft(contract, input.periodStart, input.periodEnd);
  const totals: Totals = computeTotals(
    build.subtotal,
    input.discountAmount,
    input.taxRate,
  );
  const year = input.periodStart.getFullYear();

  const createdId = await prisma.$transaction(async (tx) => {
    const seq = await nextSequence(tx, `invoice:${year}`);
    const invoiceNo = nextDocNumber("INV", year, seq);
    const created = await createInvoice(tx, {
      invoiceNo,
      contractId: contract.id,
      clientId: contract.clientId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      ...totals,
      lines: build.lines,
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "invoice.create",
        module: "billing",
        recordId: created.id,
        newValue: {
          invoiceNo,
          contractId: contract.id,
          dayCount: build.dayCount,
          lineCount: build.lines.length,
          total: totals.total,
        },
      },
      req,
    );
    return created.id;
  });

  return toInvoiceDto(await requireInvoiceDetail(createdId));
}

/**
 * Rebuild a DRAFT invoice's lines from current attendance + rates.
 * Keeps the original invoiceNo; tax rate is derived from the stored
 * totals (taxRate is not persisted on the invoice row).
 */
export async function recalculateInvoice(
  actor: Actor,
  id: string,
  req?: Request,
): Promise<InvoiceDto> {
  const invoice = await requireInvoiceDetail(id);
  guardTransition(invoice.status, "recalculate");

  const contract = await requireContractForBilling(invoice.contractId);
  const build = await buildDraft(contract, invoice.periodStart, invoice.periodEnd);

  // taxRate is not stored on Invoice; derive it from stored totals so the
  // recalculated tax stays consistent with the original rate.
  const net = round2(d2n(invoice.subtotal) - d2n(invoice.discountAmount));
  const taxRate = net > 0 ? d2n(invoice.taxAmount) / net : 0;
  const totals: Totals = computeTotals(
    build.subtotal,
    d2n(invoice.discountAmount),
    taxRate,
  );

  await prisma.$transaction(async (tx) => {
    await replaceInvoiceLines(tx, id, build.lines, totals);
    await writeAudit(
      tx,
      actor,
      {
        action: "invoice.recalculate",
        module: "billing",
        recordId: id,
        oldValue: { total: d2n(invoice.total), lineCount: invoice.lines.length },
        newValue: {
          total: totals.total,
          dayCount: build.dayCount,
          lineCount: build.lines.length,
        },
      },
      req,
    );
  });

  return toInvoiceDto(await requireInvoiceDetail(id));
}

const TRANSITION_TARGET: Record<
  "issue" | "send" | "cancel",
  InvoiceStatus
> = {
  issue: "ISSUED",
  send: "SENT",
  cancel: "CANCELLED",
};

/**
 * Apply a status transition. `issue` stamps issuedAt and computes
 * dueDate = issuedAt + contract.paymentTermsDays (date-only).
 */
export async function transitionInvoice(
  actor: Actor,
  id: string,
  transition: "issue" | "send" | "cancel",
  req?: Request,
): Promise<InvoiceDto> {
  const invoice = await requireInvoiceDetail(id);
  guardTransition(invoice.status, transition);

  const extra: Prisma.InvoiceUpdateInput = {};
  if (transition === "issue") {
    const issuedAt = new Date();
    const due = new Date(issuedAt);
    due.setDate(due.getDate() + invoice.contract.paymentTermsDays);
    extra.issuedAt = issuedAt;
    extra.dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  }

  const updated = await updateInvoiceStatus(
    prisma,
    id,
    TRANSITION_TARGET[transition],
    extra,
  );
  await writeAudit(
    prisma,
    actor,
    {
      action: `invoice.${transition}`,
      module: "billing",
      recordId: id,
      oldValue: { status: invoice.status },
      newValue: {
        status: updated.status,
        ...(extra.issuedAt ? { dueDate: dateOnlyString(extra.dueDate as Date) } : {}),
      },
    },
    req,
  );

  return toInvoiceDto(await requireInvoiceDetail(id));
}

/**
 * Record a payment. Rejects payments on DRAFT/CANCELLED/PAID invoices
 * and any amount exceeding the remaining balance (409 OVERPAYMENT,
 * round2-safe). Creates the payment + status update atomically.
 */
export async function recordPayment(
  actor: Actor,
  invoiceId: string,
  input: RecordPaymentInput,
  req?: Request,
): Promise<{
  payment: PaymentDto;
  invoiceStatus: InvoiceStatus;
  remaining: number;
}> {
  const invoice = await requireInvoiceDetail(invoiceId);
  if (
    invoice.status === "DRAFT" ||
    invoice.status === "CANCELLED" ||
    invoice.status === "PAID"
  ) {
    throw new ApiError(
      "INVOICE_NOT_PAYABLE",
      `Cannot record a payment on an invoice with status ${invoice.status}`,
      409,
    );
  }

  const total = d2n(invoice.total);
  const paidTotal = await sumPayments(prisma, invoiceId);
  const remaining = round2(total - paidTotal);
  const amount = round2(input.amount);
  if (amount > remaining) {
    throw new ApiError(
      "OVERPAYMENT",
      `Payment amount ${amount} exceeds remaining balance ${remaining}`,
      409,
      { amount, remaining },
    );
  }

  const year = input.paidAt.getFullYear();
  const result = await prisma.$transaction(async (tx) => {
    const seq = await nextSequence(tx, `payment:${year}`);
    const paymentNo = nextDocNumber("PAY", year, seq);
    const payment = await createPayment(tx, {
      paymentNo,
      invoiceId,
      amount,
      paidAt: input.paidAt,
      method: input.method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
    });

    let nextStatus: InvoiceStatusV;
    try {
      nextStatus = statusAfterPayment(invoice.status, total, round2(paidTotal + amount));
    } catch (e) {
      throw new ApiError(
        "INVOICE_NOT_PAYABLE",
        e instanceof Error ? e.message : "Cannot record payment",
        409,
      );
    }
    // A partial payment on an overdue invoice stays OVERDUE (still past
    // due) rather than flipping to PARTIALLY_PAID.
    if (
      nextStatus === "PARTIALLY_PAID" &&
      isOverdue("OVERDUE", invoice.dueDate, new Date())
    ) {
      nextStatus = "OVERDUE";
    }

    await updateInvoiceStatus(tx, invoiceId, nextStatus);
    await writeAudit(
      tx,
      actor,
      {
        action: "payment.create",
        module: "billing",
        recordId: payment.id,
        newValue: {
          paymentNo,
          invoiceId,
          amount,
          method: input.method,
          invoiceStatus: nextStatus,
        },
      },
      req,
    );
    return { payment, nextStatus };
  });

  return {
    payment: toPaymentDto(result.payment),
    invoiceStatus: result.nextStatus as InvoiceStatus,
    remaining: round2(remaining - amount),
  };
}

/**
 * Invoice detail. Auto-syncs overdue: an issued-family invoice past its
 * due date is persisted as OVERDUE on read (audited).
 */
export async function getInvoice(
  actor: Actor,
  id: string,
  req?: Request,
): Promise<InvoiceDto> {
  const invoice = await requireInvoiceDetail(id);
  if (isOverdue(invoice.status, invoice.dueDate, new Date())) {
    await updateInvoiceStatus(prisma, id, "OVERDUE");
    await writeAudit(
      prisma,
      actor,
      {
        action: "invoice.overdue",
        module: "billing",
        recordId: id,
        oldValue: { status: invoice.status },
        newValue: { status: "OVERDUE" },
      },
      req,
    );
    return toInvoiceDto(await requireInvoiceDetail(id));
  }
  return toInvoiceDto(invoice);
}

/**
 * Paginated invoice list (light rows — no paidTotal/remaining; see detail).
 */
export async function listInvoices(query: InvoiceQueryInput): Promise<{
  rows: InvoiceListDto[];
  page: number;
  pageSize: number;
  total: number;
}> {
  const { rows, total } = await repoListInvoices(prisma, {
    clientId: query.clientId,
    contractId: query.contractId,
    status: query.status,
    from: query.from,
    to: query.to,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });
  return {
    rows: rows.map(toInvoiceListDto),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

/** Payments of one invoice (used by GET /invoices/:id/payments). */
export async function listPayments(invoiceId: string): Promise<PaymentDto[]> {
  const invoice = await requireInvoiceDetail(invoiceId);
  return invoice.payments.map(toPaymentDto);
}

/**
 * E-invoice submission — STUB. Creates a PENDING EinvoiceSubmission row;
 * no external ETA call is made. Returns the stub with an integration note.
 */
export async function submitEinvoice(
  actor: Actor,
  id: string,
  req?: Request,
): Promise<{
  submission: {
    id: string;
    invoiceId: string;
    status: string;
    submittedAt: string | null;
    createdAt: string;
  };
  note: string;
}> {
  const invoice = await requireInvoiceDetail(id);
  if (invoice.status !== "ISSUED" && invoice.status !== "SENT") {
    throw new ApiError(
      "INVOICE_NOT_SUBMITTABLE",
      `E-invoice submission requires ISSUED or SENT status (current: ${invoice.status})`,
      409,
    );
  }
  const submission = await createEinvoiceSubmission(prisma, id);
  await writeAudit(
    prisma,
    actor,
    {
      action: "invoice.einvoice_submit",
      module: "billing",
      recordId: id,
      newValue: { submissionId: submission.id, status: submission.status },
    },
    req,
  );
  return {
    submission: {
      id: submission.id,
      invoiceId: submission.invoiceId,
      status: submission.status,
      submittedAt: isoDT(submission.submittedAt),
      createdAt: submission.createdAt.toISOString(),
    },
    note: "ETA integration pending — recorded as PENDING stub",
  };
}

/**
 * Sweep: mark all issued-family invoices past their due date as OVERDUE.
 * Returns the count of updated invoices.
 */
export async function refreshOverdue(
  actor: Actor,
  req?: Request,
): Promise<{ updated: number }> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const candidates = await findOverdueCandidates(prisma, today);
  let updated = 0;
  for (const c of candidates) {
    await updateInvoiceStatus(prisma, c.id, "OVERDUE");
    await writeAudit(
      prisma,
      actor,
      {
        action: "invoice.overdue",
        module: "billing",
        recordId: c.id,
        oldValue: { status: c.status },
        newValue: { status: "OVERDUE" },
      },
      req,
    );
    updated += 1;
  }
  return { updated };
}

// Re-export so tests/tools can use the date helper consistently.
export { parseDateOnly };
