/**
 * Recruitment repository — Prisma queries only, no business logic.
 * Every function takes a `Db` (root client or transaction client)
 * so callers can compose queries inside transactions.
 */
import {
  CandidateSource,
  CandidateStatus,
  InterviewResult,
  MilitaryStatus,
  Prisma,
} from "@prisma/client";
import type { Db } from "../../lib/audit";

// ------------------------- Input shapes -------------------------

export interface CandidateCreateData {
  nameAr: string;
  nameEn: string;
  nationalId: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  birthDate?: Date | null;
  gender?: string | null;
  militaryStatus: MilitaryStatus;
  education?: string | null;
  experienceYears?: number | null;
  desiredPositionId?: string | null;
  desiredSiteId?: string | null;
  source: CandidateSource;
  cvUrl?: string | null;
  notes?: string | null;
}

export interface CandidateUpdateData {
  nameAr?: string;
  nameEn?: string;
  nationalId?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  birthDate?: Date | null;
  gender?: string | null;
  militaryStatus?: MilitaryStatus;
  education?: string | null;
  experienceYears?: number | null;
  desiredPositionId?: string | null;
  desiredSiteId?: string | null;
  source?: CandidateSource;
  cvUrl?: string | null;
  notes?: string | null;
}

export interface ListCandidatesParams {
  skip: number;
  take: number;
  search?: string;
  status?: CandidateStatus;
  siteId?: string;
}

export interface InterviewCreateData {
  candidateId: string;
  scheduledAt: Date;
  interviewerId?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface InterviewUpdateData {
  scheduledAt?: Date;
  interviewerId?: string | null;
  location?: string | null;
  result?: InterviewResult;
  score?: number | null;
  notes?: string | null;
}

// ------------------------- Includes / payload types -------------------------

const interviewInclude = {
  interviewer: { select: { id: true, name: true } },
} as const;

export type InterviewDetail = Prisma.InterviewGetPayload<{
  include: typeof interviewInclude;
}>;

const candidateDetailInclude = {
  desiredPosition: {
    select: { id: true, code: true, titleAr: true, titleEn: true },
  },
  desiredSite: { select: { id: true, name: true, sectorId: true } },
  interviews: { include: interviewInclude, orderBy: { scheduledAt: "asc" } },
  documents: {
    include: {
      documentType: {
        select: { id: true, code: true, nameAr: true, nameEn: true },
      },
    },
  },
} as const;

export type CandidateDetail = Prisma.CandidateGetPayload<{
  include: typeof candidateDetailInclude;
}>;

const candidateListInclude = {
  desiredPosition: { select: { id: true, code: true, titleEn: true } },
  desiredSite: { select: { id: true, name: true } },
  _count: { select: { interviews: true } },
} as const;

export type CandidateListRow = Prisma.CandidateGetPayload<{
  include: typeof candidateListInclude;
}>;

// ------------------------- Candidates -------------------------

export async function listCandidates(
  db: Db,
  params: ListCandidatesParams,
): Promise<{ rows: CandidateListRow[]; total: number }> {
  const { skip, take, search, status, siteId } = params;
  const where: Prisma.CandidateWhereInput = {};
  if (status) where.status = status;
  if (siteId) where.desiredSiteId = siteId;
  if (search) {
    where.OR = [
      { nameAr: { contains: search, mode: "insensitive" } },
      { nameEn: { contains: search, mode: "insensitive" } },
      { nationalId: { contains: search } },
      { phone: { contains: search } },
    ];
  }
  const [rows, total] = await Promise.all([
    db.candidate.findMany({
      where,
      include: candidateListInclude,
      orderBy: { appliedAt: "desc" },
      skip,
      take,
    }),
    db.candidate.count({ where }),
  ]);
  return { rows, total };
}

export async function getCandidateById(
  db: Db,
  id: string,
): Promise<CandidateDetail | null> {
  return db.candidate.findUnique({
    where: { id },
    include: candidateDetailInclude,
  });
}

export async function findCandidateByNationalId(
  db: Db,
  nationalId: string,
): Promise<{ id: string } | null> {
  return db.candidate.findUnique({
    where: { nationalId },
    select: { id: true },
  });
}

export async function createCandidate(
  db: Db,
  data: CandidateCreateData,
): Promise<CandidateDetail> {
  return db.candidate.create({
    data: {
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      nationalId: data.nationalId,
      phone: data.phone ?? undefined,
      email: data.email ?? undefined,
      address: data.address ?? undefined,
      birthDate: data.birthDate ?? undefined,
      gender: data.gender ?? undefined,
      militaryStatus: data.militaryStatus,
      education: data.education ?? undefined,
      experienceYears: data.experienceYears ?? undefined,
      desiredPositionId: data.desiredPositionId ?? undefined,
      desiredSiteId: data.desiredSiteId ?? undefined,
      source: data.source,
      cvUrl: data.cvUrl ?? undefined,
      notes: data.notes ?? undefined,
    },
    include: candidateDetailInclude,
  });
}

export async function updateCandidate(
  db: Db,
  id: string,
  data: CandidateUpdateData,
): Promise<CandidateDetail> {
  const updateData: Prisma.CandidateUncheckedUpdateInput = {};
  if (data.nameAr !== undefined) updateData.nameAr = data.nameAr;
  if (data.nameEn !== undefined) updateData.nameEn = data.nameEn;
  if (data.nationalId !== undefined) updateData.nationalId = data.nationalId;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.birthDate !== undefined) updateData.birthDate = data.birthDate;
  if (data.gender !== undefined) updateData.gender = data.gender;
  if (data.militaryStatus !== undefined)
    updateData.militaryStatus = data.militaryStatus;
  if (data.education !== undefined) updateData.education = data.education;
  if (data.experienceYears !== undefined)
    updateData.experienceYears = data.experienceYears;
  if (data.desiredPositionId !== undefined)
    updateData.desiredPositionId = data.desiredPositionId;
  if (data.desiredSiteId !== undefined)
    updateData.desiredSiteId = data.desiredSiteId;
  if (data.source !== undefined) updateData.source = data.source;
  if (data.cvUrl !== undefined) updateData.cvUrl = data.cvUrl;
  if (data.notes !== undefined) updateData.notes = data.notes;
  return db.candidate.update({
    where: { id },
    data: updateData,
    include: candidateDetailInclude,
  });
}

export async function setCandidateStatus(
  db: Db,
  id: string,
  to: CandidateStatus,
  hiredAt?: Date,
): Promise<CandidateDetail> {
  return db.candidate.update({
    where: { id },
    data: {
      status: to,
      ...(hiredAt !== undefined ? { hiredAt } : {}),
    },
    include: candidateDetailInclude,
  });
}

export async function deleteCandidate(db: Db, id: string): Promise<void> {
  // Interviews + documents cascade (onDelete: Cascade).
  await db.candidate.delete({ where: { id } });
}

/** Status → count for the pipeline board. */
export async function countByStatus(
  db: Db,
): Promise<{ status: CandidateStatus; count: number }[]> {
  const rows = await db.candidate.groupBy({
    by: ["status"],
    _count: { status: true },
  });
  return rows.map((r) => ({ status: r.status, count: r._count.status }));
}

/** Candidate summaries grouped by status for the pipeline board. */
export async function listPipelineSummaries(
  db: Db,
): Promise<CandidateListRow[]> {
  return db.candidate.findMany({
    include: candidateListInclude,
    orderBy: { appliedAt: "desc" },
  });
}

// ------------------------- Interviews -------------------------

export async function listInterviews(
  db: Db,
  candidateId: string,
): Promise<InterviewDetail[]> {
  return db.interview.findMany({
    where: { candidateId },
    include: interviewInclude,
    orderBy: { scheduledAt: "asc" },
  });
}

export async function getInterviewById(
  db: Db,
  id: string,
): Promise<InterviewDetail | null> {
  return db.interview.findUnique({ where: { id }, include: interviewInclude });
}

export async function createInterview(
  db: Db,
  data: InterviewCreateData,
): Promise<InterviewDetail> {
  return db.interview.create({
    data: {
      candidateId: data.candidateId,
      scheduledAt: data.scheduledAt,
      interviewerId: data.interviewerId ?? undefined,
      location: data.location ?? undefined,
      notes: data.notes ?? undefined,
    },
    include: interviewInclude,
  });
}

export async function updateInterview(
  db: Db,
  id: string,
  data: InterviewUpdateData,
): Promise<InterviewDetail> {
  const updateData: Prisma.InterviewUncheckedUpdateInput = {};
  if (data.scheduledAt !== undefined) updateData.scheduledAt = data.scheduledAt;
  if (data.interviewerId !== undefined)
    updateData.interviewerId = data.interviewerId;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.result !== undefined) updateData.result = data.result;
  if (data.score !== undefined) updateData.score = data.score;
  if (data.notes !== undefined) updateData.notes = data.notes;
  return db.interview.update({
    where: { id },
    data: updateData,
    include: interviewInclude,
  });
}

export async function deleteInterview(db: Db, id: string): Promise<void> {
  await db.interview.delete({ where: { id } });
}

// ------------------------- Reference checks -------------------------

export async function findPositionById(
  db: Db,
  id: string,
): Promise<{ id: string } | null> {
  return db.position.findUnique({ where: { id }, select: { id: true } });
}

export async function findSiteById(
  db: Db,
  id: string,
): Promise<{ id: string; sectorId: string } | null> {
  return db.site.findUnique({
    where: { id },
    select: { id: true, sectorId: true },
  });
}

export async function findShiftById(
  db: Db,
  id: string,
): Promise<{ id: string } | null> {
  return db.shift.findUnique({ where: { id }, select: { id: true } });
}

export async function findUserById(
  db: Db,
  id: string,
): Promise<{ id: string } | null> {
  return db.user.findUnique({ where: { id }, select: { id: true } });
}

/** Guard against hiring the same person twice (nationalId is unique). */
export async function findEmployeeByNationalId(
  db: Db,
  nationalId: string,
): Promise<{ id: string } | null> {
  return db.employee.findUnique({
    where: { nationalId },
    select: { id: true },
  });
}
