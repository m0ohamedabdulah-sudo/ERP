/**
 * Contract repository — Prisma queries only, no business logic.
 * Every function takes a `Db` (root client or transaction client)
 * so callers can compose queries inside transactions.
 */
import { ContractStatus, Prisma, ServiceType } from "@prisma/client";
import type { Db } from "../../lib/audit";
import type { ContractWindow } from "./contract.rules";

// ------------------------- Input shapes -------------------------

export interface RateCreateData {
  shiftId?: string | null;
  positionId?: string | null;
  ratePerShift: number;
  ratePerMonth?: number | null;
  overtimeRatePerHour?: number | null;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
}

export interface ContractSiteCreateData {
  siteId: string;
  serviceType: ServiceType;
  rates: RateCreateData[];
}

export interface ContractCreateData {
  clientId: string;
  contractNo: string;
  titleAr: string;
  titleEn: string;
  startDate: Date;
  endDate: Date;
  paymentTermsDays: number;
  penaltyClause?: string | null;
  sla?: string | null;
  notes?: string | null;
  sites: ContractSiteCreateData[];
}

export interface ContractUpdateData {
  clientId?: string;
  contractNo?: string;
  titleAr?: string;
  titleEn?: string;
  startDate?: Date;
  endDate?: Date;
  paymentTermsDays?: number;
  penaltyClause?: string | null;
  sla?: string | null;
  notes?: string | null;
}

export interface ListContractsParams {
  skip: number;
  take: number;
  search?: string;
  status?: ContractStatus;
  clientId?: string;
}

// ------------------------- Includes / payload types -------------------------

const rateInclude = {
  shift: { select: { id: true, name: true } },
  position: {
    select: { id: true, code: true, titleEn: true, titleAr: true },
  },
} as const;

export type ContractRateDetail = Prisma.ContractRateGetPayload<{
  include: typeof rateInclude;
}>;

const contractSiteInclude = {
  site: { select: { id: true, name: true } },
  rates: { include: rateInclude },
} as const;

export type ContractSiteDetail = Prisma.ContractSiteGetPayload<{
  include: typeof contractSiteInclude;
}>;

const detailInclude = {
  client: {
    select: { id: true, companyNameAr: true, companyNameEn: true },
  },
  sites: { include: contractSiteInclude },
} as const;

export type ContractDetail = Prisma.ContractGetPayload<{
  include: typeof detailInclude;
}>;

const listInclude = {
  client: {
    select: { id: true, companyNameAr: true, companyNameEn: true },
  },
  _count: { select: { sites: true } },
} as const;

export type ContractListRow = Prisma.ContractGetPayload<{
  include: typeof listInclude;
}>;

// ------------------------- Helpers -------------------------

function toRateCreate(
  r: RateCreateData,
): Prisma.ContractRateUncheckedCreateWithoutContractSiteInput {
  return {
    shiftId: r.shiftId ?? undefined,
    positionId: r.positionId ?? undefined,
    ratePerShift: new Prisma.Decimal(r.ratePerShift),
    ratePerMonth:
      r.ratePerMonth != null ? new Prisma.Decimal(r.ratePerMonth) : undefined,
    overtimeRatePerHour:
      r.overtimeRatePerHour != null
        ? new Prisma.Decimal(r.overtimeRatePerHour)
        : undefined,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo ?? undefined,
  };
}

// ------------------------- Queries -------------------------

export async function listContracts(
  db: Db,
  params: ListContractsParams,
): Promise<{ rows: ContractListRow[]; total: number }> {
  const { skip, take, search, status, clientId } = params;
  const where: Prisma.ContractWhereInput = {};
  if (status) where.status = status;
  if (clientId) where.clientId = clientId;
  if (search) {
    where.OR = [
      { contractNo: { contains: search, mode: "insensitive" } },
      { titleAr: { contains: search, mode: "insensitive" } },
      { titleEn: { contains: search, mode: "insensitive" } },
    ];
  }
  const [rows, total] = await Promise.all([
    db.contract.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    db.contract.count({ where }),
  ]);
  return { rows, total };
}

export async function getContractById(
  db: Db,
  id: string,
): Promise<ContractDetail | null> {
  return db.contract.findUnique({ where: { id }, include: detailInclude });
}

export async function getContractSiteWithContract(
  db: Db,
  contractSiteId: string,
): Promise<(ContractSiteDetail & { contract: ContractDetail }) | null> {
  return db.contractSite.findUnique({
    where: { id: contractSiteId },
    include: {
      ...contractSiteInclude,
      contract: { include: detailInclude },
    },
  });
}

export async function getRateWithContract(
  db: Db,
  rateId: string,
): Promise<
  | (ContractRateDetail & {
      contractSite: { id: string; contract: { id: string; status: ContractStatus } };
    })
  | null
> {
  return db.contractRate.findUnique({
    where: { id: rateId },
    include: {
      ...rateInclude,
      contractSite: {
        select: {
          id: true,
          contract: { select: { id: true, status: true } },
        },
      },
    },
  });
}

export async function countInvoices(
  db: Db,
  contractId: string,
): Promise<number> {
  return db.invoice.count({ where: { contractId } });
}

/**
 * Active contracts with their covered site ids + periods, for the
 * no-two-active-contracts-per-site rule (see contract.rules).
 */
export async function listActiveWindows(
  db: Db,
  excludeId?: string,
): Promise<ContractWindow[]> {
  const rows = await db.contract.findMany({
    where: {
      status: ContractStatus.ACTIVE,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      contractNo: true,
      startDate: true,
      endDate: true,
      status: true,
      sites: { select: { siteId: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    contractNo: r.contractNo,
    siteIds: r.sites.map((s) => s.siteId),
    startDate: r.startDate,
    endDate: r.endDate,
    status: "ACTIVE" as const,
  }));
}

/** ACTIVE contracts whose endDate has passed — due for expiry. */
export async function findExpiredDue(
  db: Db,
  now: Date,
): Promise<{ id: string; contractNo: string; endDate: Date }[]> {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  return db.contract.findMany({
    where: {
      status: ContractStatus.ACTIVE,
      endDate: { lt: startOfToday },
    },
    select: { id: true, contractNo: true, endDate: true },
  });
}

// ------------------------- Mutations -------------------------

export async function createContract(
  db: Db,
  data: ContractCreateData,
): Promise<ContractDetail> {
  return db.contract.create({
    data: {
      clientId: data.clientId,
      contractNo: data.contractNo,
      titleAr: data.titleAr,
      titleEn: data.titleEn,
      startDate: data.startDate,
      endDate: data.endDate,
      paymentTermsDays: data.paymentTermsDays,
      penaltyClause: data.penaltyClause ?? undefined,
      sla: data.sla ?? undefined,
      notes: data.notes ?? undefined,
      sites: {
        create: data.sites.map((s) => ({
          siteId: s.siteId,
          serviceType: s.serviceType,
          rates: { create: s.rates.map(toRateCreate) },
        })),
      },
    },
    include: detailInclude,
  });
}

export async function updateContract(
  db: Db,
  id: string,
  data: ContractUpdateData,
): Promise<ContractDetail> {
  const updateData: Prisma.ContractUncheckedUpdateInput = {};
  if (data.clientId !== undefined) updateData.clientId = data.clientId;
  if (data.contractNo !== undefined) updateData.contractNo = data.contractNo;
  if (data.titleAr !== undefined) updateData.titleAr = data.titleAr;
  if (data.titleEn !== undefined) updateData.titleEn = data.titleEn;
  if (data.startDate !== undefined) updateData.startDate = data.startDate;
  if (data.endDate !== undefined) updateData.endDate = data.endDate;
  if (data.paymentTermsDays !== undefined)
    updateData.paymentTermsDays = data.paymentTermsDays;
  if (data.penaltyClause !== undefined)
    updateData.penaltyClause = data.penaltyClause;
  if (data.sla !== undefined) updateData.sla = data.sla;
  if (data.notes !== undefined) updateData.notes = data.notes;
  return db.contract.update({
    where: { id },
    data: updateData,
    include: detailInclude,
  });
}

export async function setContractStatus(
  db: Db,
  id: string,
  to: ContractStatus,
): Promise<ContractDetail> {
  return db.contract.update({
    where: { id },
    data: { status: to },
    include: detailInclude,
  });
}

export async function addContractSite(
  db: Db,
  contractId: string,
  siteInput: ContractSiteCreateData,
): Promise<ContractSiteDetail> {
  return db.contractSite.create({
    data: {
      contractId,
      siteId: siteInput.siteId,
      serviceType: siteInput.serviceType,
      rates: { create: siteInput.rates.map(toRateCreate) },
    },
    include: contractSiteInclude,
  });
}

export async function removeContractSite(
  db: Db,
  contractSiteId: string,
): Promise<void> {
  // Rates cascade (onDelete: Cascade); invoice lines are SetNull.
  await db.contractSite.delete({ where: { id: contractSiteId } });
}

export async function addRate(
  db: Db,
  contractSiteId: string,
  rate: RateCreateData,
): Promise<ContractRateDetail> {
  return db.contractRate.create({
    data: { contractSiteId, ...toRateCreate(rate) },
    include: rateInclude,
  });
}

export async function removeRate(db: Db, rateId: string): Promise<void> {
  await db.contractRate.delete({ where: { id: rateId } });
}

export async function deleteContract(db: Db, id: string): Promise<void> {
  // Sites + rates cascade (onDelete: Cascade).
  await db.contract.delete({ where: { id } });
}
