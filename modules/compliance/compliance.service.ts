/**
 * Compliance service — business logic + audit.
 * Repository handles Prisma; this layer enforces rules, builds DTOs,
 * and writes audit rows inside transactions.
 *
 * The recruitment module (built in parallel) imports the exact
 * compliance-check interface exported at the top of this file.
 */
import { DocumentStatus } from "@prisma/client";
import type { Actor } from "../../lib/auth";
import { ApiError } from "../../lib/api-response";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../lib/audit";
import type { Db } from "../../lib/audit";
import {
  EXPIRY_WARNING_DAYS,
  NOTIFICATION_DEDUP_DAYS,
  buildExpiryNotification,
  computeDocumentStatus,
  defaultExpiresAt,
  evaluateDocumentReason,
  shouldSkipExpiryNotification,
} from "./compliance.rules";
import type {
  CreateDocumentTypeInput,
  DocumentQueryInput,
  DocumentTypeQueryInput,
  PatchCandidateDocumentInput,
  PatchEmployeeDocumentInput,
  UpdateDocumentTypeInput,
  UpsertCandidateDocumentInput,
  UpsertEmployeeDocumentInput,
} from "./compliance.schema";
import * as repo from "./compliance.repository";
import type {
  CandidateDocumentDetail,
  DocumentTypeRow,
  EmployeeDocumentDetail,
  EmployeeDocumentListRow,
} from "./compliance.repository";

// =====================================================================
// Exact interface consumed by the recruitment module — DO NOT RENAME.
// =====================================================================

export interface ComplianceIssue {
  documentTypeId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  reason: "missing" | "expired" | "expiring_soon";
}

export interface ComplianceCheckResult {
  compliant: boolean;
  issues: ComplianceIssue[];
}

export async function checkCandidateCompliance(
  candidateId: string,
): Promise<ComplianceCheckResult> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true },
  });
  if (!candidate) {
    throw new ApiError("CANDIDATE_NOT_FOUND", "Candidate not found", 404);
  }
  const now = new Date();
  const required = await repo.listRequiredDocumentTypes(prisma);
  const docs = await repo.listCandidateDocuments(prisma, candidateId);
  const byType = new Map(docs.map((d) => [d.documentTypeId, d]));
  return evaluateCompliance(required, byType, now);
}

/**
 * Copy a candidate's documents onto the new employee record (hiring).
 * Runs inside the caller's transaction — does NOT open its own.
 */
export async function transferCandidateDocuments(
  tx: Db,
  candidateId: string,
  employeeId: string,
): Promise<number> {
  const docs = await repo.listCandidateDocuments(tx, candidateId);
  const now = new Date();
  for (const d of docs) {
    await repo.upsertEmployeeDocument(tx, employeeId, {
      documentTypeId: d.documentTypeId,
      documentNo: d.documentNo,
      issuedAt: d.issuedAt,
      expiresAt: d.expiresAt,
      status: computeDocumentStatus(d.expiresAt, now),
      fileUrl: d.fileUrl,
      notes: d.notes,
      verifiedById: d.verifiedById,
      verifiedAt: d.verifiedAt,
    });
  }
  return docs.length;
}

// =====================================================================
// Shared compliance evaluation (candidates + employees)
// =====================================================================

function evaluateCompliance(
  required: DocumentTypeRow[],
  byType: Map<string, { expiresAt: Date | null }>,
  now: Date,
): ComplianceCheckResult {
  const issues: ComplianceIssue[] = [];
  for (const t of required) {
    const doc = byType.get(t.id);
    if (!doc) {
      issues.push({
        documentTypeId: t.id,
        code: t.code,
        nameAr: t.nameAr,
        nameEn: t.nameEn,
        reason: "missing",
      });
      continue;
    }
    const reason = evaluateDocumentReason(doc.expiresAt, now);
    if (reason !== "valid") {
      issues.push({
        documentTypeId: t.id,
        code: t.code,
        nameAr: t.nameAr,
        nameEn: t.nameEn,
        reason,
      });
    }
  }
  const compliant = !issues.some(
    (i) => i.reason === "missing" || i.reason === "expired",
  );
  return { compliant, issues };
}

// =====================================================================
// DTOs
// =====================================================================

export interface DocumentTypeDto {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  requiredForHire: boolean;
  validityMonths: number | null;
  isRecurring: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateDocumentDto {
  id: string;
  candidateId: string;
  documentTypeId: string;
  documentTypeCode: string;
  documentTypeNameAr: string;
  documentTypeNameEn: string;
  documentNo: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  fileUrl: string | null;
  verifiedById: string | null;
  verifiedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeDocumentDto {
  id: string;
  employeeId: string;
  documentTypeId: string;
  documentTypeCode: string;
  documentTypeNameAr: string;
  documentTypeNameEn: string;
  documentNo: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: DocumentStatus;
  fileUrl: string | null;
  verifiedById: string | null;
  verifiedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeComplianceSummary {
  employeeId: string;
  totalRequired: number;
  valid: number;
  expiringSoon: number;
  expired: number;
  missing: {
    documentTypeId: string;
    code: string;
    nameAr: string;
    nameEn: string;
  }[];
  /** 0..1 share of required documents that are VALID */
  completePct: number;
}

export interface SiteComplianceSummary {
  siteId: string;
  siteName: string;
  totalEmployees: number;
  atRiskEmployees: number;
  /** mean completePct across employees */
  completePct: number;
  employees: (EmployeeComplianceSummary & {
    employeeNameAr: string;
    employeeNameEn: string;
  })[];
}

function toDocumentTypeDto(t: DocumentTypeRow): DocumentTypeDto {
  return {
    id: t.id,
    code: t.code,
    nameAr: t.nameAr,
    nameEn: t.nameEn,
    requiredForHire: t.requiredForHire,
    validityMonths: t.validityMonths,
    isRecurring: t.isRecurring,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

const isoOrNull = (d: Date | null): string | null =>
  d ? d.toISOString() : null;

function toCandidateDocumentDto(d: CandidateDocumentDetail): CandidateDocumentDto {
  return {
    id: d.id,
    candidateId: d.candidateId,
    documentTypeId: d.documentTypeId,
    documentTypeCode: d.documentType.code,
    documentTypeNameAr: d.documentType.nameAr,
    documentTypeNameEn: d.documentType.nameEn,
    documentNo: d.documentNo,
    issuedAt: isoOrNull(d.issuedAt),
    expiresAt: isoOrNull(d.expiresAt),
    fileUrl: d.fileUrl,
    verifiedById: d.verifiedById,
    verifiedAt: isoOrNull(d.verifiedAt),
    notes: d.notes,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function toEmployeeDocDto(
  d: EmployeeDocumentListRow | EmployeeDocumentDetail,
): EmployeeDocumentDto {
  return {
    id: d.id,
    employeeId: d.employeeId,
    documentTypeId: d.documentTypeId,
    documentTypeCode: d.documentType.code,
    documentTypeNameAr: d.documentType.nameAr,
    documentTypeNameEn: d.documentType.nameEn,
    documentNo: d.documentNo,
    issuedAt: isoOrNull(d.issuedAt),
    expiresAt: isoOrNull(d.expiresAt),
    status: d.status,
    fileUrl: d.fileUrl,
    verifiedById: d.verifiedById,
    verifiedAt: isoOrNull(d.verifiedAt),
    notes: d.notes,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

// =====================================================================
// Helpers
// =====================================================================

async function getDocumentTypeOr404(id: string): Promise<DocumentTypeRow> {
  const type = await repo.getDocumentTypeById(prisma, id);
  if (!type) {
    throw new ApiError("DOCUMENT_TYPE_NOT_FOUND", "Document type not found", 404);
  }
  return type;
}

async function assertCandidateExists(candidateId: string): Promise<void> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true },
  });
  if (!candidate) {
    throw new ApiError("CANDIDATE_NOT_FOUND", "Candidate not found", 404);
  }
}

async function assertEmployeeExists(employeeId: string): Promise<void> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) {
    throw new ApiError("EMPLOYEE_NOT_FOUND", "Employee not found", 404);
  }
}

/**
 * Resolve expiresAt for a document write: explicit value wins,
 * otherwise default from issuedAt + the type's validityMonths.
 */
function resolveExpiresAt(
  input: { issuedAt?: Date | null; expiresAt?: Date | null },
  validityMonths: number | null,
): Date | null | undefined {
  if (input.expiresAt !== undefined) return input.expiresAt;
  if (input.issuedAt == null) return undefined; // leave stored value untouched
  return defaultExpiresAt(input.issuedAt, validityMonths);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function summarizeEmployee(
  employeeId: string,
  docsByType: Map<string, { expiresAt: Date | null }>,
  required: DocumentTypeRow[],
  now: Date,
): EmployeeComplianceSummary {
  let valid = 0;
  let expiringSoon = 0;
  let expired = 0;
  const missing: EmployeeComplianceSummary["missing"] = [];
  for (const t of required) {
    const doc = docsByType.get(t.id);
    if (!doc) {
      missing.push({
        documentTypeId: t.id,
        code: t.code,
        nameAr: t.nameAr,
        nameEn: t.nameEn,
      });
      continue;
    }
    const reason = evaluateDocumentReason(doc.expiresAt, now);
    if (reason === "valid") valid++;
    else if (reason === "expiring_soon") expiringSoon++;
    else expired++;
  }
  const totalRequired = required.length;
  return {
    employeeId,
    totalRequired,
    valid,
    expiringSoon,
    expired,
    missing,
    completePct: totalRequired === 0 ? 1 : round2(valid / totalRequired),
  };
}

// =====================================================================
// Document types
// =====================================================================

export async function listDocumentTypes(
  input: DocumentTypeQueryInput,
): Promise<{ rows: DocumentTypeDto[]; total: number }> {
  const { rows, total } = await repo.listDocumentTypes(prisma, {
    skip: (input.page - 1) * input.pageSize,
    take: input.pageSize,
    search: input.search,
    requiredForHire: input.requiredForHire,
  });
  return { rows: rows.map(toDocumentTypeDto), total };
}

export async function getDocumentType(id: string): Promise<DocumentTypeDto> {
  return toDocumentTypeDto(await getDocumentTypeOr404(id));
}

export async function createDocumentType(
  actor: Actor,
  input: CreateDocumentTypeInput,
  req?: Request,
): Promise<DocumentTypeDto> {
  const existing = await repo.getDocumentTypeByCode(prisma, input.code);
  if (existing) {
    throw new ApiError(
      "DOCUMENT_TYPE_CODE_EXISTS",
      `Document type code already exists: ${input.code}`,
      409,
    );
  }
  const created = await prisma.$transaction(async (tx) => {
    const row = await repo.createDocumentType(tx, input);
    await writeAudit(
      tx,
      actor,
      {
        action: "compliance.document-type.create",
        module: "compliance",
        recordId: row.id,
        newValue: toDocumentTypeDto(row),
      },
      req,
    );
    return row;
  });
  return toDocumentTypeDto(created);
}

export async function updateDocumentType(
  actor: Actor,
  id: string,
  input: UpdateDocumentTypeInput,
  req?: Request,
): Promise<DocumentTypeDto> {
  const old = toDocumentTypeDto(await getDocumentTypeOr404(id));
  const updated = await prisma.$transaction(async (tx) => {
    const row = await repo.updateDocumentType(tx, id, input);
    await writeAudit(
      tx,
      actor,
      {
        action: "compliance.document-type.update",
        module: "compliance",
        recordId: id,
        oldValue: old,
        newValue: toDocumentTypeDto(row),
      },
      req,
    );
    return row;
  });
  return toDocumentTypeDto(updated);
}

export async function deleteDocumentType(
  actor: Actor,
  id: string,
  req?: Request,
): Promise<{ deleted: boolean; id: string }> {
  const old = toDocumentTypeDto(await getDocumentTypeOr404(id));
  const inUse = await repo.countDocumentsForType(prisma, id);
  if (inUse > 0) {
    throw new ApiError(
      "DOCUMENT_TYPE_IN_USE",
      `Cannot delete document type referenced by ${inUse} document(s)`,
      409,
      { documentCount: inUse },
    );
  }
  await prisma.$transaction(async (tx) => {
    await repo.deleteDocumentType(tx, id);
    await writeAudit(
      tx,
      actor,
      {
        action: "compliance.document-type.delete",
        module: "compliance",
        recordId: id,
        oldValue: old,
      },
      req,
    );
  });
  return { deleted: true, id };
}

// =====================================================================
// Candidate documents
// =====================================================================

export async function listCandidateDocuments(
  candidateId: string,
): Promise<CandidateDocumentDto[]> {
  await assertCandidateExists(candidateId);
  const docs = await repo.listCandidateDocuments(prisma, candidateId);
  return docs.map(toCandidateDocumentDto);
}

export async function upsertCandidateDocument(
  actor: Actor,
  candidateId: string,
  input: UpsertCandidateDocumentInput,
  req?: Request,
): Promise<CandidateDocumentDto> {
  await assertCandidateExists(candidateId);
  const type = await getDocumentTypeOr404(input.documentTypeId);
  const expiresAt = resolveExpiresAt(input, type.validityMonths);
  const previous = await repo.getCandidateDocument(
    prisma,
    candidateId,
    input.documentTypeId,
  );
  const saved = await prisma.$transaction(async (tx) => {
    const row = await repo.upsertCandidateDocument(tx, candidateId, {
      ...input,
      expiresAt: expiresAt === undefined ? input.expiresAt : expiresAt,
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "compliance.document.upsert",
        module: "compliance",
        recordId: row.id,
        oldValue: previous ? toCandidateDocumentDto(previous) : undefined,
        newValue: toCandidateDocumentDto(row),
      },
      req,
    );
    return row;
  });
  return toCandidateDocumentDto(saved);
}

export async function updateCandidateDocumentById(
  actor: Actor,
  docId: string,
  input: PatchCandidateDocumentInput,
  req?: Request,
): Promise<CandidateDocumentDto> {
  const existing = await repo.getCandidateDocumentById(prisma, docId);
  if (!existing) {
    throw new ApiError(
      "CANDIDATE_DOCUMENT_NOT_FOUND",
      "Candidate document not found",
      404,
    );
  }
  const expiresAt = resolveExpiresAt(
    input,
    existing.documentType.validityMonths,
  );
  const saved = await prisma.$transaction(async (tx) => {
    const row = await repo.updateCandidateDocument(tx, docId, {
      ...input,
      expiresAt:
        expiresAt === undefined ? existing.expiresAt : expiresAt,
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "compliance.document.upsert",
        module: "compliance",
        recordId: docId,
        oldValue: toCandidateDocumentDto(existing),
        newValue: toCandidateDocumentDto(row),
      },
      req,
    );
    return row;
  });
  return toCandidateDocumentDto(saved);
}

export async function deleteCandidateDocument(
  actor: Actor,
  docId: string,
  req?: Request,
): Promise<{ deleted: boolean; id: string }> {
  const existing = await repo.getCandidateDocumentById(prisma, docId);
  if (!existing) {
    throw new ApiError(
      "CANDIDATE_DOCUMENT_NOT_FOUND",
      "Candidate document not found",
      404,
    );
  }
  const oldValue = toCandidateDocumentDto(existing);
  await prisma.$transaction(async (tx) => {
    await repo.deleteCandidateDocument(tx, docId);
    await writeAudit(
      tx,
      actor,
      {
        action: "compliance.document.delete",
        module: "compliance",
        recordId: docId,
        oldValue,
      },
      req,
    );
  });
  return { deleted: true, id: docId };
}

// =====================================================================
// Employee documents
// =====================================================================

export interface ListEmployeeDocumentsInput extends DocumentQueryInput {
  employeeId: string;
}

export async function listEmployeeDocuments(
  input: ListEmployeeDocumentsInput,
): Promise<{ rows: EmployeeDocumentDto[]; total: number }> {
  await assertEmployeeExists(input.employeeId);
  const { rows, total } = await repo.listEmployeeDocuments(
    prisma,
    input.employeeId,
    {
      status: input.status,
      documentTypeId: input.documentTypeId,
      expiringWithinDays: input.expiringWithinDays,
      search: input.search,
    },
    (input.page - 1) * input.pageSize,
    input.pageSize,
  );
  return { rows: rows.map(toEmployeeDocDto), total };
}

export async function upsertEmployeeDocument(
  actor: Actor,
  employeeId: string,
  input: UpsertEmployeeDocumentInput,
  req?: Request,
): Promise<EmployeeDocumentDto> {
  await assertEmployeeExists(employeeId);
  const type = await getDocumentTypeOr404(input.documentTypeId);
  const expiresAt = resolveExpiresAt(input, type.validityMonths);
  const resolvedExpiresAt =
    expiresAt === undefined ? input.expiresAt : expiresAt;
  const status = computeDocumentStatus(resolvedExpiresAt ?? null, new Date());
  const previous = await repo.getEmployeeDocument(
    prisma,
    employeeId,
    input.documentTypeId,
  );
  const saved = await prisma.$transaction(async (tx) => {
    const row = await repo.upsertEmployeeDocument(tx, employeeId, {
      ...input,
      expiresAt: resolvedExpiresAt,
      status,
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "compliance.document.upsert",
        module: "compliance",
        recordId: row.id,
        oldValue: previous ? toEmployeeDocDto(previous) : undefined,
        newValue: toEmployeeDocDto(row),
      },
      req,
    );
    return row;
  });
  return toEmployeeDocDto(saved);
}

export async function updateEmployeeDocumentById(
  actor: Actor,
  docId: string,
  input: PatchEmployeeDocumentInput,
  req?: Request,
): Promise<EmployeeDocumentDto> {
  const existing = await repo.getEmployeeDocumentById(prisma, docId);
  if (!existing) {
    throw new ApiError(
      "EMPLOYEE_DOCUMENT_NOT_FOUND",
      "Employee document not found",
      404,
    );
  }
  const expiresAt = resolveExpiresAt(
    input,
    existing.documentType.validityMonths,
  );
  const resolvedExpiresAt =
    expiresAt === undefined ? existing.expiresAt : expiresAt;
  const status = computeDocumentStatus(resolvedExpiresAt, new Date());
  const saved = await prisma.$transaction(async (tx) => {
    const row = await repo.updateEmployeeDocument(tx, docId, {
      ...input,
      expiresAt: resolvedExpiresAt,
      status,
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "compliance.document.upsert",
        module: "compliance",
        recordId: docId,
        oldValue: toEmployeeDocDto(existing),
        newValue: toEmployeeDocDto(row),
      },
      req,
    );
    return row;
  });
  return toEmployeeDocDto(saved);
}

export async function deleteEmployeeDocument(
  actor: Actor,
  docId: string,
  req?: Request,
): Promise<{ deleted: boolean; id: string }> {
  const existing = await repo.getEmployeeDocumentById(prisma, docId);
  if (!existing) {
    throw new ApiError(
      "EMPLOYEE_DOCUMENT_NOT_FOUND",
      "Employee document not found",
      404,
    );
  }
  const oldValue = toEmployeeDocDto(existing);
  await prisma.$transaction(async (tx) => {
    await repo.deleteEmployeeDocument(tx, docId);
    await writeAudit(
      tx,
      actor,
      {
        action: "compliance.document.delete",
        module: "compliance",
        recordId: docId,
        oldValue,
      },
      req,
    );
  });
  return { deleted: true, id: docId };
}

/**
 * Mark a document verified. The `compliance.verify` permission is
 * enforced at the controller layer; the actor is recorded as verifier.
 */
export async function verifyDocument(
  actor: Actor,
  kind: "candidate" | "employee",
  docId: string,
  req?: Request,
): Promise<CandidateDocumentDto | EmployeeDocumentDto> {
  const verifiedAt = new Date();
  const verifiedById = actor.userId; // null for dev actors — column is nullable
  const saved = await prisma.$transaction(async (tx) => {
    if (kind === "employee") {
      const existing = await repo.getEmployeeDocumentById(tx, docId);
      if (!existing) {
        throw new ApiError(
          "EMPLOYEE_DOCUMENT_NOT_FOUND",
          "Employee document not found",
          404,
        );
      }
      const row = await repo.verifyEmployeeDocument(
        tx,
        docId,
        verifiedById,
        verifiedAt,
      );
      await writeAudit(
        tx,
        actor,
        {
          action: "compliance.document.verify",
          module: "compliance",
          recordId: docId,
          oldValue: toEmployeeDocDto(existing),
          newValue: toEmployeeDocDto(row),
        },
        req,
      );
      return toEmployeeDocDto(row);
    }
    const existing = await repo.getCandidateDocumentById(tx, docId);
    if (!existing) {
      throw new ApiError(
        "CANDIDATE_DOCUMENT_NOT_FOUND",
        "Candidate document not found",
        404,
      );
    }
    const row = await repo.verifyCandidateDocument(
      tx,
      docId,
      verifiedById,
      verifiedAt,
    );
    await writeAudit(
      tx,
      actor,
      {
        action: "compliance.document.verify",
        module: "compliance",
        recordId: docId,
        oldValue: toCandidateDocumentDto(existing),
        newValue: toCandidateDocumentDto(row),
      },
      req,
    );
    return toCandidateDocumentDto(row);
  });
  return saved;
}

// =====================================================================
// Compliance checks / summaries
// =====================================================================

export async function checkEmployeeCompliance(
  employeeId: string,
): Promise<ComplianceCheckResult> {
  await assertEmployeeExists(employeeId);
  const now = new Date();
  const required = await repo.listRequiredDocumentTypes(prisma);
  const { rows } = await repo.listEmployeeDocuments(
    prisma,
    employeeId,
    {},
    0,
    1000,
  );
  const byType = new Map(rows.map((d) => [d.documentTypeId, d]));
  return evaluateCompliance(required, byType, now);
}

export async function getEmployeeComplianceSummary(
  employeeId: string,
): Promise<EmployeeComplianceSummary> {
  await assertEmployeeExists(employeeId);
  const now = new Date();
  const required = await repo.listRequiredDocumentTypes(prisma);
  const { rows } = await repo.listEmployeeDocuments(
    prisma,
    employeeId,
    {},
    0,
    1000,
  );
  const byType = new Map(rows.map((d) => [d.documentTypeId, d]));
  return summarizeEmployee(employeeId, byType, required, now);
}

export async function getSiteComplianceSummary(
  siteId: string,
): Promise<SiteComplianceSummary> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, name: true },
  });
  if (!site) {
    throw new ApiError("SITE_NOT_FOUND", "Site not found", 404);
  }
  const now = new Date();
  const required = await repo.listRequiredDocumentTypes(prisma);
  const employees = await repo.listEmployeesWithDocumentsBySite(prisma, siteId);
  const summaries = employees.map((e) => {
    const byType = new Map(e.documents.map((d) => [d.documentTypeId, d]));
    return {
      ...summarizeEmployee(e.id, byType, required, now),
      employeeNameAr: e.fullNameAr,
      employeeNameEn: e.fullNameEn,
    };
  });
  const atRisk = summaries.filter(
    (s) => s.expired > 0 || s.missing.length > 0,
  );
  const completePct =
    summaries.length === 0
      ? 1
      : round2(
          summaries.reduce((n, s) => n + s.completePct, 0) / summaries.length,
        );
  return {
    siteId: site.id,
    siteName: site.name,
    totalEmployees: summaries.length,
    atRiskEmployees: atRisk.length,
    completePct,
    employees: atRisk,
  };
}

// =====================================================================
// Expiry sweep
// =====================================================================

export interface SweepResult {
  checked: number;
  expiring: number;
  expired: number;
  notified: number;
}

/**
 * Find employee documents expiring within EXPIRY_WARNING_DAYS (or
 * already expired), refresh their stored status, and broadcast one
 * notification per document. Dedups against unread notifications of
 * the same type + employee created within NOTIFICATION_DEDUP_DAYS.
 */
export async function flagExpiringDocuments(
  actor: Actor,
  req?: Request,
): Promise<SweepResult> {
  const now = new Date();
  const cutoff = new Date(
    now.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000,
  );
  const docs = await repo.findEmployeeDocsExpiringBefore(prisma, cutoff);

  const dedupSince = new Date(
    now.getTime() - NOTIFICATION_DEDUP_DAYS * 24 * 60 * 60 * 1000,
  );
  const relatedIds = [...new Set(docs.map((d) => d.employeeId))];
  const recent = await repo.findRecentExpiryNotifications(
    prisma,
    ["DOCUMENT_EXPIRING", "DOCUMENT_EXPIRED"],
    relatedIds,
    dedupSince,
  );

  let expiring = 0;
  let expired = 0;
  let notified = 0;

  for (const doc of docs) {
    const status = computeDocumentStatus(doc.expiresAt, now);
    if (status !== doc.status) {
      await repo.updateEmployeeDocumentStatus(prisma, doc.id, status);
    }
    const isExpired = status === "EXPIRED";
    if (isExpired) expired++;
    else if (status === "EXPIRING_SOON") expiring++;
    else continue;

    const draft = buildExpiryNotification({
      employeeId: doc.employeeId,
      employeeNameEn: doc.employee.fullNameEn,
      employeeNameAr: doc.employee.fullNameAr,
      documentTypeNameEn: doc.documentType.nameEn,
      documentTypeNameAr: doc.documentType.nameAr,
      expiresAt: doc.expiresAt as Date,
      expired: isExpired,
    });
    if (shouldSkipExpiryNotification(recent, draft, now)) continue;

    await prisma.$transaction(async (tx) => {
      await repo.createExpiryNotification(tx, draft);
      await writeAudit(
        tx,
        actor,
        {
          action: "compliance.sweep.notify",
          module: "compliance",
          recordId: doc.id,
          newValue: {
            type: draft.type,
            employeeId: doc.employeeId,
            documentTypeCode: doc.documentType.code,
          },
        },
        req,
      );
    });
    notified++;
  }

  return { checked: docs.length, expiring, expired, notified };
}
