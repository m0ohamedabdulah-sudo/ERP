/**
 * Compliance repository — Prisma queries only, no business logic.
 * Every function takes a `Db` (root client or transaction client)
 * so callers can compose queries inside transactions.
 */
import { DocumentStatus, Prisma } from "@prisma/client";
import type { Db } from "../../lib/audit";

// ------------------------- Input shapes -------------------------

export interface DocumentTypeCreateData {
  code: string;
  nameAr: string;
  nameEn: string;
  requiredForHire: boolean;
  validityMonths?: number | null;
  isRecurring: boolean;
}

export interface DocumentTypeUpdateData {
  nameAr?: string;
  nameEn?: string;
  requiredForHire?: boolean;
  validityMonths?: number | null;
  isRecurring?: boolean;
}

export interface ListDocumentTypesParams {
  skip: number;
  take: number;
  search?: string;
  requiredForHire?: boolean;
}

export interface DocumentUpsertData {
  documentTypeId: string;
  documentNo?: string | null;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
  fileUrl?: string | null;
  notes?: string | null;
}

export interface ListDocumentsParams {
  skip: number;
  take: number;
  status?: DocumentStatus;
  documentTypeId?: string;
  /** only documents with expiresAt within this many days from now */
  expiringWithinDays?: number;
  search?: string;
}

// ------------------------- Includes / payload types -------------------------

const documentTypeSelect = {
  id: true,
  code: true,
  nameAr: true,
  nameEn: true,
  requiredForHire: true,
  validityMonths: true,
  isRecurring: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type DocumentTypeRow = Prisma.DocumentTypeGetPayload<{
  select: typeof documentTypeSelect;
}>;

const candidateDocInclude = {
  documentType: { select: documentTypeSelect },
} as const;

export type CandidateDocumentDetail = Prisma.CandidateDocumentGetPayload<{
  include: typeof candidateDocInclude;
}>;

const employeeDocInclude = {
  documentType: { select: documentTypeSelect },
  employee: {
    select: {
      id: true,
      fullNameAr: true,
      fullNameEn: true,
      siteId: true,
    },
  },
} as const;

export type EmployeeDocumentDetail = Prisma.EmployeeDocumentGetPayload<{
  include: typeof employeeDocInclude;
}>;

export type EmployeeDocumentListRow = Prisma.EmployeeDocumentGetPayload<{
  include: typeof employeeDocInclude;
}>;

const employeeWithDocsInclude = {
  id: true,
  fullNameAr: true,
  fullNameEn: true,
  siteId: true,
  status: true,
  documents: { include: { documentType: { select: documentTypeSelect } } },
} as const;

export type EmployeeWithDocuments = Prisma.EmployeeGetPayload<{
  select: typeof employeeWithDocsInclude;
}>;

// ------------------------- Document types -------------------------

export async function listDocumentTypes(
  db: Db,
  params: ListDocumentTypesParams,
): Promise<{ rows: DocumentTypeRow[]; total: number }> {
  const { skip, take, search, requiredForHire } = params;
  const where: Prisma.DocumentTypeWhereInput = {};
  if (requiredForHire !== undefined) where.requiredForHire = requiredForHire;
  if (search) {
    where.OR = [
      { code: { contains: search, mode: "insensitive" } },
      { nameAr: { contains: search, mode: "insensitive" } },
      { nameEn: { contains: search, mode: "insensitive" } },
    ];
  }
  const [rows, total] = await Promise.all([
    db.documentType.findMany({
      where,
      select: documentTypeSelect,
      orderBy: { code: "asc" },
      skip,
      take,
    }),
    db.documentType.count({ where }),
  ]);
  return { rows, total };
}

/** All types required before hire — drives compliance checks. */
export async function listRequiredDocumentTypes(
  db: Db,
): Promise<DocumentTypeRow[]> {
  return db.documentType.findMany({
    where: { requiredForHire: true },
    select: documentTypeSelect,
    orderBy: { code: "asc" },
  });
}

export async function getDocumentTypeById(
  db: Db,
  id: string,
): Promise<DocumentTypeRow | null> {
  return db.documentType.findUnique({
    where: { id },
    select: documentTypeSelect,
  });
}

export async function getDocumentTypeByCode(
  db: Db,
  code: string,
): Promise<DocumentTypeRow | null> {
  return db.documentType.findUnique({
    where: { code },
    select: documentTypeSelect,
  });
}

export async function createDocumentType(
  db: Db,
  data: DocumentTypeCreateData,
): Promise<DocumentTypeRow> {
  return db.documentType.create({
    data: {
      code: data.code,
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      requiredForHire: data.requiredForHire,
      validityMonths: data.validityMonths ?? undefined,
      isRecurring: data.isRecurring,
    },
    select: documentTypeSelect,
  });
}

export async function updateDocumentType(
  db: Db,
  id: string,
  data: DocumentTypeUpdateData,
): Promise<DocumentTypeRow> {
  const updateData: Prisma.DocumentTypeUncheckedUpdateInput = {};
  if (data.nameAr !== undefined) updateData.nameAr = data.nameAr;
  if (data.nameEn !== undefined) updateData.nameEn = data.nameEn;
  if (data.requiredForHire !== undefined)
    updateData.requiredForHire = data.requiredForHire;
  if (data.validityMonths !== undefined)
    updateData.validityMonths = data.validityMonths;
  if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
  return db.documentType.update({
    where: { id },
    data: updateData,
    select: documentTypeSelect,
  });
}

export async function deleteDocumentType(db: Db, id: string): Promise<void> {
  await db.documentType.delete({ where: { id } });
}

/** Documents (candidate + employee) referencing a type — deletion guard. */
export async function countDocumentsForType(
  db: Db,
  documentTypeId: string,
): Promise<number> {
  const [candidateDocs, employeeDocs] = await Promise.all([
    db.candidateDocument.count({ where: { documentTypeId } }),
    db.employeeDocument.count({ where: { documentTypeId } }),
  ]);
  return candidateDocs + employeeDocs;
}

// ------------------------- Candidate documents -------------------------

export async function listCandidateDocuments(
  db: Db,
  candidateId: string,
): Promise<CandidateDocumentDetail[]> {
  return db.candidateDocument.findMany({
    where: { candidateId },
    include: candidateDocInclude,
    orderBy: { documentType: { code: "asc" } },
  });
}

export async function getCandidateDocument(
  db: Db,
  candidateId: string,
  documentTypeId: string,
): Promise<CandidateDocumentDetail | null> {
  return db.candidateDocument.findUnique({
    where: { candidateId_documentTypeId: { candidateId, documentTypeId } },
    include: candidateDocInclude,
  });
}

export async function getCandidateDocumentById(
  db: Db,
  id: string,
): Promise<CandidateDocumentDetail | null> {
  return db.candidateDocument.findUnique({
    where: { id },
    include: candidateDocInclude,
  });
}

export async function upsertCandidateDocument(
  db: Db,
  candidateId: string,
  data: DocumentUpsertData,
): Promise<CandidateDocumentDetail> {
  return db.candidateDocument.upsert({
    where: {
      candidateId_documentTypeId: {
        candidateId,
        documentTypeId: data.documentTypeId,
      },
    },
    create: {
      candidateId,
      documentTypeId: data.documentTypeId,
      documentNo: data.documentNo ?? undefined,
      issuedAt: data.issuedAt ?? undefined,
      expiresAt: data.expiresAt ?? undefined,
      fileUrl: data.fileUrl ?? undefined,
      notes: data.notes ?? undefined,
    },
    update: {
      documentNo: data.documentNo ?? undefined,
      issuedAt: data.issuedAt ?? undefined,
      expiresAt: data.expiresAt ?? undefined,
      fileUrl: data.fileUrl ?? undefined,
      notes: data.notes ?? undefined,
    },
    include: candidateDocInclude,
  });
}

export async function updateCandidateDocument(
  db: Db,
  id: string,
  data: Partial<DocumentUpsertData>,
): Promise<CandidateDocumentDetail> {
  const updateData: Prisma.CandidateDocumentUncheckedUpdateInput = {};
  if (data.documentNo !== undefined) updateData.documentNo = data.documentNo;
  if (data.issuedAt !== undefined) updateData.issuedAt = data.issuedAt;
  if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt;
  if (data.fileUrl !== undefined) updateData.fileUrl = data.fileUrl;
  if (data.notes !== undefined) updateData.notes = data.notes;
  return db.candidateDocument.update({
    where: { id },
    data: updateData,
    include: candidateDocInclude,
  });
}

export async function deleteCandidateDocument(
  db: Db,
  id: string,
): Promise<void> {
  await db.candidateDocument.delete({ where: { id } });
}

// ------------------------- Employee documents -------------------------

export async function listEmployeeDocuments(
  db: Db,
  employeeId: string,
  params: Omit<ListDocumentsParams, "skip" | "take">,
  skip: number,
  take: number,
): Promise<{ rows: EmployeeDocumentListRow[]; total: number }> {
  const { status, documentTypeId, expiringWithinDays, search } = params;
  const where: Prisma.EmployeeDocumentWhereInput = { employeeId };
  if (status) where.status = status;
  if (documentTypeId) where.documentTypeId = documentTypeId;
  if (expiringWithinDays !== undefined) {
    const limit = new Date(Date.now() + expiringWithinDays * 24 * 60 * 60 * 1000);
    where.expiresAt = { lte: limit };
  }
  if (search) {
    where.OR = [
      { documentNo: { contains: search, mode: "insensitive" } },
      { documentType: { code: { contains: search, mode: "insensitive" } } },
      { documentType: { nameAr: { contains: search, mode: "insensitive" } } },
      { documentType: { nameEn: { contains: search, mode: "insensitive" } } },
    ];
  }
  const [rows, total] = await Promise.all([
    db.employeeDocument.findMany({
      where,
      include: employeeDocInclude,
      orderBy: { documentType: { code: "asc" } },
      skip,
      take,
    }),
    db.employeeDocument.count({ where }),
  ]);
  return { rows, total };
}

export async function getEmployeeDocument(
  db: Db,
  employeeId: string,
  documentTypeId: string,
): Promise<EmployeeDocumentDetail | null> {
  return db.employeeDocument.findUnique({
    where: { employeeId_documentTypeId: { employeeId, documentTypeId } },
    include: employeeDocInclude,
  });
}

export async function getEmployeeDocumentById(
  db: Db,
  id: string,
): Promise<EmployeeDocumentDetail | null> {
  return db.employeeDocument.findUnique({
    where: { id },
    include: employeeDocInclude,
  });
}

export async function upsertEmployeeDocument(
  db: Db,
  employeeId: string,
  data: DocumentUpsertData & {
    status: DocumentStatus;
    verifiedById?: string | null;
    verifiedAt?: Date | null;
  },
): Promise<EmployeeDocumentDetail> {
  return db.employeeDocument.upsert({
    where: {
      employeeId_documentTypeId: {
        employeeId,
        documentTypeId: data.documentTypeId,
      },
    },
    create: {
      employeeId,
      documentTypeId: data.documentTypeId,
      documentNo: data.documentNo ?? undefined,
      issuedAt: data.issuedAt ?? undefined,
      expiresAt: data.expiresAt ?? undefined,
      status: data.status,
      fileUrl: data.fileUrl ?? undefined,
      notes: data.notes ?? undefined,
      verifiedById: data.verifiedById ?? undefined,
      verifiedAt: data.verifiedAt ?? undefined,
    },
    update: {
      documentNo: data.documentNo ?? undefined,
      issuedAt: data.issuedAt ?? undefined,
      expiresAt: data.expiresAt ?? undefined,
      status: data.status,
      fileUrl: data.fileUrl ?? undefined,
      notes: data.notes ?? undefined,
      verifiedById: data.verifiedById ?? undefined,
      verifiedAt: data.verifiedAt ?? undefined,
    },
    include: employeeDocInclude,
  });
}

export async function updateEmployeeDocument(
  db: Db,
  id: string,
  data: Partial<DocumentUpsertData> & { status?: DocumentStatus },
): Promise<EmployeeDocumentDetail> {
  const updateData: Prisma.EmployeeDocumentUncheckedUpdateInput = {};
  if (data.documentNo !== undefined) updateData.documentNo = data.documentNo;
  if (data.issuedAt !== undefined) updateData.issuedAt = data.issuedAt;
  if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.fileUrl !== undefined) updateData.fileUrl = data.fileUrl;
  if (data.notes !== undefined) updateData.notes = data.notes;
  return db.employeeDocument.update({
    where: { id },
    data: updateData,
    include: employeeDocInclude,
  });
}

export async function updateEmployeeDocumentStatus(
  db: Db,
  id: string,
  status: DocumentStatus,
): Promise<void> {
  await db.employeeDocument.update({ where: { id }, data: { status } });
}

export async function verifyEmployeeDocument(
  db: Db,
  id: string,
  verifiedById: string | null,
  verifiedAt: Date,
): Promise<EmployeeDocumentDetail> {
  return db.employeeDocument.update({
    where: { id },
    data: { verifiedById, verifiedAt },
    include: employeeDocInclude,
  });
}

export async function verifyCandidateDocument(
  db: Db,
  id: string,
  verifiedById: string | null,
  verifiedAt: Date,
): Promise<CandidateDocumentDetail> {
  return db.candidateDocument.update({
    where: { id },
    data: { verifiedById, verifiedAt },
    include: candidateDocInclude,
  });
}

export async function deleteEmployeeDocument(
  db: Db,
  id: string,
): Promise<void> {
  await db.employeeDocument.delete({ where: { id } });
}

// ------------------------- Sweep + summaries -------------------------

/** Employee documents expiring on or before `before` (includes expired). */
export async function findEmployeeDocsExpiringBefore(
  db: Db,
  before: Date,
): Promise<EmployeeDocumentDetail[]> {
  return db.employeeDocument.findMany({
    where: { expiresAt: { lte: before } },
    include: employeeDocInclude,
    orderBy: { expiresAt: "asc" },
  });
}

/**
 * Recent notifications for sweep dedup: unread, same type + relatedId,
 * created within the dedup window.
 */
export async function findRecentExpiryNotifications(
  db: Db,
  types: string[],
  relatedIds: string[],
  since: Date,
): Promise<
  { type: string; relatedId: string | null; isRead: boolean; createdAt: Date }[]
> {
  if (types.length === 0 || relatedIds.length === 0) return [];
  return db.notification.findMany({
    where: {
      type: { in: types },
      relatedModule: "compliance",
      relatedId: { in: relatedIds },
      isRead: false,
      createdAt: { gte: since },
    },
    select: { type: true, relatedId: true, isRead: true, createdAt: true },
  });
}

export async function createExpiryNotification(
  db: Db,
  draft: {
    type: string;
    title: string;
    titleAr: string;
    body: string;
    bodyAr: string;
    relatedModule: string;
    relatedId: string;
  },
): Promise<void> {
  await db.notification.create({
    data: {
      userId: null, // broadcast
      type: draft.type,
      title: draft.title,
      titleAr: draft.titleAr,
      body: draft.body,
      bodyAr: draft.bodyAr,
      relatedModule: draft.relatedModule,
      relatedId: draft.relatedId,
    },
  });
}

/** Active employees of a site with their documents + types. */
export async function listEmployeesWithDocumentsBySite(
  db: Db,
  siteId: string,
): Promise<EmployeeWithDocuments[]> {
  return db.employee.findMany({
    where: { siteId, deletedAt: null },
    select: employeeWithDocsInclude,
    orderBy: { fullNameEn: "asc" },
  });
}
