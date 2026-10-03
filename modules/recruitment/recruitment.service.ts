/**
 * Recruitment service — business logic + audit.
 * Repository handles Prisma; this layer enforces rules, builds DTOs,
 * and writes audit rows inside transactions.
 */
import {
  CandidateStatus,
  EmployeeStatus,
  InterviewResult,
  Prisma,
} from "@prisma/client";
import type { Actor } from "../../lib/auth";
import { ApiError } from "../../lib/api-response";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../lib/audit";
import { nextSequence } from "../billing/billing.repository";
import {
  checkCandidateCompliance,
  transferCandidateDocuments,
} from "../compliance/compliance.service";
import {
  assertCandidateTransition,
  canApproveCandidate,
  TERMINAL_STATUSES,
  type CandidateStatusV,
} from "./recruitment.rules";
import type {
  CreateCandidateInput,
  HireCandidateInput,
  ScheduleInterviewInput,
  UpdateCandidateInput,
  UpdateInterviewInput,
} from "./recruitment.schema";
import * as repo from "./recruitment.repository";
import type {
  CandidateDetail,
  CandidateListRow,
  InterviewDetail,
} from "./recruitment.repository";

// ------------------------- DTOs -------------------------

export interface InterviewDto {
  id: string;
  candidateId: string;
  scheduledAt: string;
  interviewerId: string | null;
  interviewerName: string | null;
  location: string | null;
  result: InterviewResult;
  score: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateDocumentDto {
  id: string;
  documentTypeId: string;
  documentTypeCode: string;
  documentTypeNameAr: string;
  documentTypeNameEn: string;
  documentNo: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  fileUrl: string | null;
  verifiedAt: string | null;
  notes: string | null;
}

export interface CandidateDto {
  id: string;
  nameAr: string;
  nameEn: string;
  nationalId: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  birthDate: string | null;
  gender: string | null;
  militaryStatus: string;
  education: string | null;
  experienceYears: number | null;
  desiredPositionId: string | null;
  desiredPositionCode: string | null;
  desiredPositionTitleEn: string | null;
  desiredSiteId: string | null;
  desiredSiteName: string | null;
  source: string;
  status: CandidateStatus;
  cvUrl: string | null;
  notes: string | null;
  appliedAt: string;
  hiredAt: string | null;
  interviews: InterviewDto[];
  documents: CandidateDocumentDto[];
  createdAt: string;
  updatedAt: string;
}

export interface PipelineCandidateSummary {
  id: string;
  nameAr: string;
  nameEn: string;
  nationalId: string;
  status: CandidateStatus;
  desiredPositionCode: string | null;
  desiredSiteName: string | null;
  interviewCount: number;
  appliedAt: string;
}

export interface PipelineStage {
  status: CandidateStatus;
  count: number;
  candidates: PipelineCandidateSummary[];
}

export interface HireResult {
  employeeId: string;
  cardNumber: string;
  candidateId: string;
}

function toInterviewDto(i: InterviewDetail): InterviewDto {
  return {
    id: i.id,
    candidateId: i.candidateId,
    scheduledAt: i.scheduledAt.toISOString(),
    interviewerId: i.interviewerId,
    interviewerName: i.interviewer?.name ?? null,
    location: i.location,
    result: i.result,
    score: i.score,
    notes: i.notes,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

function toCandidateDto(c: CandidateDetail): CandidateDto {
  return {
    id: c.id,
    nameAr: c.nameAr,
    nameEn: c.nameEn,
    nationalId: c.nationalId,
    phone: c.phone,
    email: c.email,
    address: c.address,
    birthDate: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : null,
    gender: c.gender,
    militaryStatus: c.militaryStatus,
    education: c.education,
    experienceYears: c.experienceYears,
    desiredPositionId: c.desiredPositionId,
    desiredPositionCode: c.desiredPosition?.code ?? null,
    desiredPositionTitleEn: c.desiredPosition?.titleEn ?? null,
    desiredSiteId: c.desiredSiteId,
    desiredSiteName: c.desiredSite?.name ?? null,
    source: c.source,
    status: c.status,
    cvUrl: c.cvUrl,
    notes: c.notes,
    appliedAt: c.appliedAt.toISOString(),
    hiredAt: c.hiredAt ? c.hiredAt.toISOString() : null,
    interviews: c.interviews.map(toInterviewDto),
    documents: c.documents.map((d) => ({
      id: d.id,
      documentTypeId: d.documentTypeId,
      documentTypeCode: d.documentType.code,
      documentTypeNameAr: d.documentType.nameAr,
      documentTypeNameEn: d.documentType.nameEn,
      documentNo: d.documentNo,
      issuedAt: d.issuedAt ? d.issuedAt.toISOString().slice(0, 10) : null,
      expiresAt: d.expiresAt ? d.expiresAt.toISOString().slice(0, 10) : null,
      fileUrl: d.fileUrl,
      verifiedAt: d.verifiedAt ? d.verifiedAt.toISOString() : null,
      notes: d.notes,
    })),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function toSummary(row: CandidateListRow): PipelineCandidateSummary {
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    nationalId: row.nationalId,
    status: row.status,
    desiredPositionCode: row.desiredPosition?.code ?? null,
    desiredSiteName: row.desiredSite?.name ?? null,
    interviewCount: row._count.interviews,
    appliedAt: row.appliedAt.toISOString(),
  };
}

// ------------------------- Helpers -------------------------

async function getCandidateOr404(id: string): Promise<CandidateDetail> {
  const candidate = await repo.getCandidateById(prisma, id);
  if (!candidate) {
    throw new ApiError("CANDIDATE_NOT_FOUND", "Candidate not found", 404);
  }
  return candidate;
}

function assertNotHired(candidate: CandidateDetail, action: string): void {
  if (candidate.status === CandidateStatus.HIRED) {
    throw new ApiError(
      "CANDIDATE_HIRED",
      `Cannot ${action}: candidate has been hired`,
      409,
    );
  }
}

async function verifyReferences(
  input:
    | CreateCandidateInput
    | UpdateCandidateInput,
): Promise<void> {
  if (input.desiredPositionId) {
    const position = await repo.findPositionById(
      prisma,
      input.desiredPositionId,
    );
    if (!position) {
      throw new ApiError(
        "POSITION_NOT_FOUND",
        `Position not found: ${input.desiredPositionId}`,
        404,
      );
    }
  }
  if (input.desiredSiteId) {
    const site = await repo.findSiteById(prisma, input.desiredSiteId);
    if (!site) {
      throw new ApiError(
        "SITE_NOT_FOUND",
        `Site not found: ${input.desiredSiteId}`,
        404,
      );
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// ------------------------- Candidates -------------------------

export interface ListCandidatesInput {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  search?: string;
  status?: CandidateStatus;
  siteId?: string;
}

export async function listCandidates(
  input: ListCandidatesInput,
): Promise<{ rows: PipelineCandidateSummary[]; total: number }> {
  const { rows, total } = await repo.listCandidates(prisma, {
    skip: input.skip,
    take: input.take,
    search: input.search,
    status: input.status,
    siteId: input.siteId,
  });
  return { rows: rows.map(toSummary), total };
}

export async function getCandidate(id: string): Promise<CandidateDto> {
  return toCandidateDto(await getCandidateOr404(id));
}

export async function createCandidate(
  actor: Actor,
  input: CreateCandidateInput,
  req?: Request,
): Promise<CandidateDto> {
  await verifyReferences(input);
  const dup = await repo.findCandidateByNationalId(prisma, input.nationalId);
  if (dup) {
    throw new ApiError(
      "CANDIDATE_EXISTS",
      `A candidate with nationalId ${input.nationalId} already exists`,
      409,
    );
  }
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await repo.createCandidate(tx, input);
      await writeAudit(
        tx,
        actor,
        {
          action: "recruitment.create",
          module: "recruitment",
          recordId: row.id,
          newValue: toCandidateDto(row),
        },
        req,
      );
      return row;
    });
    return toCandidateDto(created);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(
        "CANDIDATE_EXISTS",
        `A candidate with nationalId ${input.nationalId} already exists`,
        409,
      );
    }
    throw err;
  }
}

export async function updateCandidate(
  actor: Actor,
  id: string,
  input: UpdateCandidateInput,
  req?: Request,
): Promise<CandidateDto> {
  const existing = await getCandidateOr404(id);
  assertNotHired(existing, "update candidate");
  await verifyReferences(input);
  if (input.nationalId !== undefined && input.nationalId !== existing.nationalId) {
    const dup = await repo.findCandidateByNationalId(prisma, input.nationalId);
    if (dup && dup.id !== id) {
      throw new ApiError(
        "CANDIDATE_EXISTS",
        `A candidate with nationalId ${input.nationalId} already exists`,
        409,
      );
    }
  }
  const oldDto = toCandidateDto(existing);
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await repo.updateCandidate(tx, id, input);
      await writeAudit(
        tx,
        actor,
        {
          action: "recruitment.update",
          module: "recruitment",
          recordId: id,
          oldValue: oldDto,
          newValue: toCandidateDto(row),
        },
        req,
      );
      return row;
    });
    return toCandidateDto(updated);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(
        "CANDIDATE_EXISTS",
        `A candidate with nationalId ${input.nationalId} already exists`,
        409,
      );
    }
    throw err;
  }
}

export async function deleteCandidate(
  actor: Actor,
  id: string,
  req?: Request,
): Promise<{ deleted: boolean; id: string }> {
  const existing = await getCandidateOr404(id);
  assertNotHired(existing, "delete candidate");
  const linked = await prisma.employee.findUnique({
    where: { candidateId: id },
    select: { id: true },
  });
  if (linked) {
    throw new ApiError(
      "CANDIDATE_HIRED",
      "Cannot delete candidate: an employee record was created from it",
      409,
    );
  }
  const oldValue = toCandidateDto(existing);
  await prisma.$transaction(async (tx) => {
    await repo.deleteCandidate(tx, id);
    await writeAudit(
      tx,
      actor,
      {
        action: "recruitment.delete",
        module: "recruitment",
        recordId: id,
        oldValue,
      },
      req,
    );
  });
  return { deleted: true, id };
}

// ------------------------- Status -------------------------

export async function transitionStatus(
  actor: Actor,
  id: string,
  to: CandidateStatus,
  req?: Request,
): Promise<CandidateDto> {
  const existing = await getCandidateOr404(id);
  const from = existing.status;

  if (to === CandidateStatus.HIRED) {
    throw new ApiError(
      "INVALID_TRANSITION",
      "Candidates are hired through the hire action, not via status transition",
      422,
    );
  }

  try {
    assertCandidateTransition(from as CandidateStatusV, to as CandidateStatusV);
  } catch {
    throw new ApiError(
      "INVALID_TRANSITION",
      `Cannot transition candidate from ${from} to ${to}`,
      422,
    );
  }

  if (to === CandidateStatus.APPROVED) {
    if (
      !canApproveCandidate(existing.interviews.map((i) => i.result))
    ) {
      throw new ApiError(
        "APPROVAL_BLOCKED",
        "Cannot approve: candidate has no PASSED interview",
        422,
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await repo.setCandidateStatus(tx, id, to);
    await writeAudit(
      tx,
      actor,
      {
        action: "recruitment.status.transition",
        module: "recruitment",
        recordId: id,
        oldValue: { status: from },
        newValue: { status: to },
      },
      req,
    );
    return row;
  });
  return toCandidateDto(updated);
}

// ------------------------- Pipeline -------------------------

const PIPELINE_ORDER: CandidateStatus[] = [
  CandidateStatus.NEW,
  CandidateStatus.SCREENING,
  CandidateStatus.INTERVIEW,
  CandidateStatus.MEDICAL_SECURITY_CHECK,
  CandidateStatus.APPROVED,
  CandidateStatus.REJECTED,
  CandidateStatus.HIRED,
];

export async function getPipeline(): Promise<PipelineStage[]> {
  const counts = await repo.countByStatus(prisma);
  const summaries = await repo.listPipelineSummaries(prisma);
  const countByStatus = new Map<CandidateStatus, number>(
    counts.map((c) => [c.status, c.count]),
  );
  return PIPELINE_ORDER.map((status) => ({
    status,
    count: countByStatus.get(status) ?? 0,
    candidates: summaries
      .filter((s) => s.status === status)
      .map(toSummary),
  }));
}

// ------------------------- Interviews -------------------------

export async function listInterviews(
  candidateId: string,
): Promise<InterviewDto[]> {
  await getCandidateOr404(candidateId);
  const rows = await repo.listInterviews(prisma, candidateId);
  return rows.map(toInterviewDto);
}

export async function scheduleInterview(
  actor: Actor,
  candidateId: string,
  input: ScheduleInterviewInput,
  req?: Request,
): Promise<InterviewDto> {
  const candidate = await getCandidateOr404(candidateId);
  if (
    (TERMINAL_STATUSES as string[]).includes(candidate.status)
  ) {
    throw new ApiError(
      "INVALID_CANDIDATE_STATUS",
      `Cannot schedule an interview for a ${candidate.status} candidate`,
      422,
    );
  }
  if (input.interviewerId) {
    const interviewer = await repo.findUserById(prisma, input.interviewerId);
    if (!interviewer) {
      throw new ApiError(
        "INTERVIEWER_NOT_FOUND",
        `Interviewer not found: ${input.interviewerId}`,
        404,
      );
    }
  }
  const created = await prisma.$transaction(async (tx) => {
    const row = await repo.createInterview(tx, {
      candidateId,
      scheduledAt: input.scheduledAt,
      interviewerId: input.interviewerId ?? null,
      location: input.location ?? null,
      notes: input.notes ?? null,
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "recruitment.interview.schedule",
        module: "recruitment",
        recordId: candidateId,
        newValue: toInterviewDto(row),
      },
      req,
    );
    return row;
  });
  return toInterviewDto(created);
}

export async function updateInterview(
  actor: Actor,
  interviewId: string,
  input: UpdateInterviewInput,
  req?: Request,
): Promise<InterviewDto> {
  const existing = await repo.getInterviewById(prisma, interviewId);
  if (!existing) {
    throw new ApiError("INTERVIEW_NOT_FOUND", "Interview not found", 404);
  }
  if (input.interviewerId) {
    const interviewer = await repo.findUserById(prisma, input.interviewerId);
    if (!interviewer) {
      throw new ApiError(
        "INTERVIEWER_NOT_FOUND",
        `Interviewer not found: ${input.interviewerId}`,
        404,
      );
    }
  }
  const oldDto = toInterviewDto(existing);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await repo.updateInterview(tx, interviewId, {
      scheduledAt: input.scheduledAt ?? undefined,      interviewerId: input.interviewerId ?? undefined,
      location: input.location ?? undefined,
      result: input.result,
      score: input.score ?? undefined,
      notes: input.notes ?? undefined,
    });
    await writeAudit(
      tx,
      actor,
      {
        action: "recruitment.interview.update",
        module: "recruitment",
        recordId: existing.candidateId,
        oldValue: oldDto,
        newValue: toInterviewDto(row),
      },
      req,
    );
    return row;
  });
  return toInterviewDto(updated);
}

export async function deleteInterview(
  actor: Actor,
  interviewId: string,
  req?: Request,
): Promise<{ deleted: boolean; id: string }> {
  const existing = await repo.getInterviewById(prisma, interviewId);
  if (!existing) {
    throw new ApiError("INTERVIEW_NOT_FOUND", "Interview not found", 404);
  }
  const oldValue = toInterviewDto(existing);
  await prisma.$transaction(async (tx) => {
    await repo.deleteInterview(tx, interviewId);
    await writeAudit(
      tx,
      actor,
      {
        action: "recruitment.interview.delete",
        module: "recruitment",
        recordId: existing.candidateId,
        oldValue,
      },
      req,
    );
  });
  return { deleted: true, id: interviewId };
}

// ------------------------- Hire -------------------------

function assertComplianceOverridePermission(actor: Actor): void {
  if (
    !actor.permissions.includes("compliance.override") &&
    !actor.permissions.includes("*")
  ) {
    throw new ApiError(
      "FORBIDDEN",
      "Missing permission: compliance.override",
      403,
    );
  }
}

export async function hireCandidate(
  actor: Actor,
  id: string,
  input: HireCandidateInput,
  req?: Request,
): Promise<HireResult> {
  const candidate = await getCandidateOr404(id);

  // (a) Only APPROVED candidates can be hired.
  if (candidate.status !== CandidateStatus.APPROVED) {
    throw new ApiError(
      "INVALID_CANDIDATE_STATUS",
      `Cannot hire candidate: status is ${candidate.status}, expected APPROVED`,
      422,
    );
  }

  // (b/c) Compliance gate.
  const compliance = await checkCandidateCompliance(id);
  if (!compliance.compliant && !input.overrideCompliance) {
    throw new ApiError(
      "COMPLIANCE_BLOCKED",
      "Candidate is not compliant: missing or expired required documents",
      422,
      { issues: compliance.issues },
    );
  }
  if (!compliance.compliant && input.overrideCompliance) {
    assertComplianceOverridePermission(actor);
  }

  // (d) Resolve site → sector.
  const siteId = input.siteId ?? candidate.desiredSiteId;
  if (!siteId) {
    throw new ApiError(
      "SITE_REQUIRED",
      "A site is required: pass siteId or set the candidate's desired site",
      422,
    );
  }
  const site = await repo.findSiteById(prisma, siteId);
  if (!site) {
    throw new ApiError("SITE_NOT_FOUND", `Site not found: ${siteId}`, 404);
  }
  if (input.shiftId) {
    const shift = await repo.findShiftById(prisma, input.shiftId);
    if (!shift) {
      throw new ApiError(
        "SHIFT_NOT_FOUND",
        `Shift not found: ${input.shiftId}`,
        404,
      );
    }
  }

  // (e) No duplicate employee for this nationalId.
  const dupEmployee = await repo.findEmployeeByNationalId(
    prisma,
    candidate.nationalId,
  );
  if (dupEmployee) {
    throw new ApiError(
      "DUPLICATE_NATIONAL_ID",
      `An employee with nationalId ${candidate.nationalId} already exists`,
      409,
    );
  }

  const year = new Date().getFullYear();

  const result = await prisma.$transaction(async (tx) => {
    // (f) Card number from the shared numbering sequence.
    const seq = await nextSequence(tx, `employee-card:${year}`);
    const cardNumber = `EMP-${year}-${seq}`;

    // (g) Create the employee.
    const employee = await tx.employee.create({
      data: {
        cardNumber,
        fullNameAr: candidate.nameAr,
        fullNameEn: candidate.nameEn,
        nationalId: candidate.nationalId,
        mobile: candidate.phone,
        dateOfBirth: candidate.birthDate ?? undefined,
        hiringDate: startOfToday(),
        positionId: candidate.desiredPositionId,
        siteId,
        sectorId: site.sectorId,
        shiftId: input.shiftId ?? null,
        salary:
          input.salary != null ? new Prisma.Decimal(input.salary) : null,
        candidateId: candidate.id,
        status: EmployeeStatus.ACTIVE,
      },
      select: { id: true, cardNumber: true },
    });

    // (h) Transfer collected candidate documents to employee documents.
    const transferredDocs = await transferCandidateDocuments(
      tx,
      candidate.id,
      employee.id,
    );

    // (i) Mark the candidate hired.
    await repo.setCandidateStatus(tx, candidate.id, CandidateStatus.HIRED, new Date());

    // (j) Audits.
    if (!compliance.compliant && input.overrideCompliance) {
      await writeAudit(
        tx,
        actor,
        {
          action: "recruitment.hire.override",
          module: "recruitment",
          recordId: candidate.id,
          newValue: {
            employeeId: employee.id,
            cardNumber: employee.cardNumber,
            overriddenIssues: compliance.issues,
          },
        },
        req,
      );
    }
    await writeAudit(
      tx,
      actor,
      {
        action: "recruitment.hire",
        module: "recruitment",
        recordId: candidate.id,
        oldValue: { status: candidate.status },
        newValue: {
          status: CandidateStatus.HIRED,
          employeeId: employee.id,
          cardNumber: employee.cardNumber,
          transferredDocuments: transferredDocs,
        },
      },
      req,
    );

    return { employeeId: employee.id, cardNumber: employee.cardNumber };
  });

  return { ...result, candidateId: id };
}
