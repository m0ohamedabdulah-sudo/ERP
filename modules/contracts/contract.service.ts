/**
 * Contract service — business logic + audit.
 * Repository handles Prisma; this layer enforces rules, builds DTOs,
 * and writes audit rows inside transactions.
 */
import { ContractStatus, Prisma } from "@prisma/client";
import type { Actor } from "../../lib/auth";
import { ApiError } from "../../lib/api-response";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../lib/audit";
import { d2n, d2nOrNull } from "../../lib/decimal";
import {
  assertContractTransition,
  findSiteConflicts,
} from "./contract.rules";
import type {
  AddRateInput,
  AddSiteInput,
  CreateContractInput,
  UpdateContractInput,
} from "./contract.schema";
import * as repo from "./contract.repository";
import type {
  ContractDetail,
  ContractListRow,
  ContractRateDetail,
  ContractSiteDetail,
} from "./contract.repository";

// ------------------------- DTOs -------------------------

export interface ContractRateDto {
  id: string;
  contractSiteId: string;
  shiftId: string | null;
  positionId: string | null;
  shiftName: string | null;
  positionCode: string | null;
  ratePerShift: number;
  ratePerMonth: number | null;
  overtimeRatePerHour: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ContractSiteDto {
  id: string;
  contractId: string;
  siteId: string;
  siteName: string;
  serviceType: string;
  rates: ContractRateDto[];
}

export interface ContractDto {
  id: string;
  clientId: string;
  clientName: string;
  contractNo: string;
  titleAr: string;
  titleEn: string;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  paymentTermsDays: number;
  penaltyClause: string | null;
  sla: string | null;
  notes: string | null;
  sites: ContractSiteDto[];
  siteCount: number;
  createdAt: string;
  updatedAt: string;
}

function toRateDto(r: ContractRateDetail): ContractRateDto {
  return {
    id: r.id,
    contractSiteId: r.contractSiteId,
    shiftId: r.shiftId,
    positionId: r.positionId,
    shiftName: r.shift?.name ?? null,
    positionCode: r.position?.code ?? null,
    ratePerShift: d2n(r.ratePerShift),
    ratePerMonth: d2nOrNull(r.ratePerMonth),
    overtimeRatePerHour: d2nOrNull(r.overtimeRatePerHour),
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
  };
}

function toSiteDto(s: ContractSiteDetail): ContractSiteDto {
  return {
    id: s.id,
    contractId: s.contractId,
    siteId: s.siteId,
    siteName: s.site.name,
    serviceType: s.serviceType,
    rates: s.rates.map(toRateDto),
  };
}

function toContractDto(c: ContractDetail): ContractDto {
  return {
    id: c.id,
    clientId: c.clientId,
    clientName: c.client.companyNameEn || c.client.companyNameAr,
    contractNo: c.contractNo,
    titleAr: c.titleAr,
    titleEn: c.titleEn,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    status: c.status,
    paymentTermsDays: c.paymentTermsDays,
    penaltyClause: c.penaltyClause,
    sla: c.sla,
    notes: c.notes,
    sites: c.sites.map(toSiteDto),
    siteCount: c.sites.length,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function toListItemDto(row: ContractListRow): ContractDto {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.client.companyNameEn || row.client.companyNameAr,
    contractNo: row.contractNo,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    status: row.status,
    paymentTermsDays: row.paymentTermsDays,
    penaltyClause: row.penaltyClause,
    sla: row.sla,
    notes: row.notes,
    sites: [],
    siteCount: row._count.sites,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ------------------------- Helpers -------------------------

async function getContractOr404(id: string): Promise<ContractDetail> {
  const contract = await repo.getContractById(prisma, id);
  if (!contract) {
    throw new ApiError("CONTRACT_NOT_FOUND", "Contract not found", 404);
  }
  return contract;
}

function assertDraft(contract: ContractDetail, action: string): void {
  if (contract.status !== ContractStatus.DRAFT) {
    throw new ApiError(
      "CONTRACT_LOCKED",
      `Cannot ${action}: contract is ${contract.status}`,
      409,
    );
  }
}

async function verifyIdsExist(
  kind: "site" | "shift" | "position",
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const unique = [...new Set(ids)];
  let found: { id: string }[];
  if (kind === "site") {
    found = await prisma.site.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
  } else if (kind === "shift") {
    found = await prisma.shift.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
  } else {
    found = await prisma.position.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
  }
  if (found.length !== unique.length) {
    const foundIds = new Set(found.map((f) => f.id));
    const missing = unique.filter((id) => !foundIds.has(id));
    const code =
      kind === "site"
        ? "SITE_NOT_FOUND"
        : kind === "shift"
          ? "SHIFT_NOT_FOUND"
          : "POSITION_NOT_FOUND";
    throw new ApiError(
      code,
      `${kind} not found: ${missing.join(", ")}`,
      404,
      { missing },
    );
  }
}

function collectRateRefIds(sites: AddSiteInput[] | AddRateInput[]) {
  const shiftIds: string[] = [];
  const positionIds: string[] = [];
  for (const s of sites) {
    const rates = "rates" in s ? s.rates : [s];
    for (const r of rates) {
      if (r.shiftId) shiftIds.push(r.shiftId);
      if (r.positionId) positionIds.push(r.positionId);
    }
  }
  return { shiftIds, positionIds };
}

function conflictDetails(
  conflicts: ReturnType<typeof findSiteConflicts>,
) {
  return conflicts.map((c) => ({
    id: c.id,
    contractNo: c.contractNo,
    siteIds: c.siteIds,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
  }));
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

// ------------------------- Read -------------------------

export interface ListContractsInput {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  search?: string;
  status?: ContractStatus;
  clientId?: string;
}

export async function listContracts(
  input: ListContractsInput,
): Promise<{ rows: ContractDto[]; total: number }> {
  const { rows, total } = await repo.listContracts(prisma, {
    skip: input.skip,
    take: input.take,
    search: input.search,
    status: input.status,
    clientId: input.clientId,
  });
  return { rows: rows.map(toListItemDto), total };
}

export async function getContract(id: string): Promise<ContractDto> {
  return toContractDto(await getContractOr404(id));
}

// ------------------------- Create / update -------------------------

export async function createContract(
  actor: Actor,
  input: CreateContractInput,
  req?: Request,
): Promise<ContractDto> {
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true },
  });
  if (!client) {
    throw new ApiError("CLIENT_NOT_FOUND", "Client not found", 404);
  }
  const existingNo = await prisma.contract.findUnique({
    where: { contractNo: input.contractNo },
    select: { id: true },
  });
  if (existingNo) {
    throw new ApiError(
      "CONTRACT_NO_EXISTS",
      `Contract number already exists: ${input.contractNo}`,
      409,
    );
  }
  await verifyIdsExist(
    "site",
    input.sites.map((s) => s.siteId),
  );
  const { shiftIds, positionIds } = collectRateRefIds(input.sites);
  await verifyIdsExist("shift", shiftIds);
  await verifyIdsExist("position", positionIds);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await repo.createContract(tx, input);
      await writeAudit(
        tx,
        actor,
        {
          action: "contract.create",
          module: "contracts",
          recordId: row.id,
          newValue: toContractDto(row),
        },
        req,
      );
      return row;
    });
    return toContractDto(created);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(
        "CONTRACT_NO_EXISTS",
        `Contract number already exists: ${input.contractNo}`,
        409,
      );
    }
    throw err;
  }
}

const DRAFT_UPDATABLE = ["clientId", "contractNo", "titleAr", "titleEn", "startDate", "endDate"] as const;
type LockedField = (typeof DRAFT_UPDATABLE)[number];

export async function updateContract(
  actor: Actor,
  id: string,
  input: UpdateContractInput,
  req?: Request,
): Promise<ContractDto> {
  const existing = await getContractOr404(id);

  if (existing.status !== ContractStatus.DRAFT) {
    const attempted = (Object.keys(input) as (keyof UpdateContractInput)[]).filter(
      (k): k is LockedField =>
        (DRAFT_UPDATABLE as readonly string[]).includes(k) &&
        input[k] !== undefined,
    );
    if (attempted.length > 0) {
      throw new ApiError(
        "CONTRACT_LOCKED",
        `Contract is ${existing.status}; only notes, sla, penaltyClause and paymentTermsDays can change. Locked fields attempted: ${attempted.join(", ")}`,
        409,
        { lockedFields: attempted },
      );
    }
  }

  // If dates change while ACTIVE, re-verify site overlap (defensive;
  // ACTIVE contracts cannot change dates via the lock above).
  if (
    existing.status === ContractStatus.ACTIVE &&
    (input.startDate !== undefined || input.endDate !== undefined)
  ) {
    const candidate = {
      siteIds: existing.sites.map((s) => s.siteId),
      startDate: input.startDate ?? existing.startDate,
      endDate: input.endDate ?? existing.endDate,
    };
    const windows = await repo.listActiveWindows(prisma, id);
    const conflicts = findSiteConflicts(candidate, windows, id);
    if (conflicts.length > 0) {
      throw new ApiError(
        "CONTRACT_SITE_CONFLICT",
        "Updated period conflicts with other active contracts",
        409,
        { conflicts: conflictDetails(conflicts) },
      );
    }
  }

  if (input.contractNo !== undefined && input.contractNo !== existing.contractNo) {
    const dup = await prisma.contract.findUnique({
      where: { contractNo: input.contractNo },
      select: { id: true },
    });
    if (dup) {
      throw new ApiError(
        "CONTRACT_NO_EXISTS",
        `Contract number already exists: ${input.contractNo}`,
        409,
      );
    }
  }

  const oldDto = toContractDto(existing);
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await repo.updateContract(tx, id, input);
      await writeAudit(
        tx,
        actor,
        {
          action: "contract.update",
          module: "contracts",
          recordId: id,
          oldValue: oldDto,
          newValue: toContractDto(row),
        },
        req,
      );
      return row;
    });
    return toContractDto(updated);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(
        "CONTRACT_NO_EXISTS",
        "Contract number already exists",
        409,
      );
    }
    throw err;
  }
}

// ------------------------- Status -------------------------

export async function transitionStatus(
  actor: Actor,
  id: string,
  to: ContractStatus,
  req?: Request,
): Promise<ContractDto> {
  const existing = await getContractOr404(id);
  const from = existing.status;

  try {
    assertContractTransition(from, to);
  } catch {
    throw new ApiError(
      "INVALID_TRANSITION",
      `Cannot transition contract from ${from} to ${to}`,
      409,
    );
  }

  if (to === ContractStatus.ACTIVE) {
    if (existing.sites.length === 0) {
      throw new ApiError(
        "CONTRACT_INCOMPLETE",
        "Cannot activate a contract with no sites",
        409,
      );
    }
    const rateCount = existing.sites.reduce((n, s) => n + s.rates.length, 0);
    if (rateCount === 0) {
      throw new ApiError(
        "CONTRACT_INCOMPLETE",
        "Cannot activate a contract with no rates",
        409,
      );
    }
    if (existing.endDate.getTime() <= existing.startDate.getTime()) {
      throw new ApiError(
        "CONTRACT_INCOMPLETE",
        "Contract endDate must be after startDate",
        409,
      );
    }
    const windows = await repo.listActiveWindows(prisma, id);
    const conflicts = findSiteConflicts(
      {
        siteIds: existing.sites.map((s) => s.siteId),
        startDate: existing.startDate,
        endDate: existing.endDate,
      },
      windows,
      id,
    );
    if (conflicts.length > 0) {
      throw new ApiError(
        "CONTRACT_SITE_CONFLICT",
        `Site coverage conflicts with active contract(s): ${conflicts.map((c) => c.contractNo).join(", ")}`,
        409,
        { conflicts: conflictDetails(conflicts) },
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await repo.setContractStatus(tx, id, to);
    await writeAudit(
      tx,
      actor,
      {
        action: "contract.status",
        module: "contracts",
        recordId: id,
        oldValue: { status: from },
        newValue: { status: to },
      },
      req,
    );
    return row;
  });
  return toContractDto(updated);
}

// ------------------------- Sites -------------------------

export async function addSite(
  actor: Actor,
  contractId: string,
  siteInput: AddSiteInput,
  req?: Request,
): Promise<ContractSiteDto> {
  const existing = await getContractOr404(contractId);
  assertDraft(existing, "add site");
  await verifyIdsExist("site", [siteInput.siteId]);
  const { shiftIds, positionIds } = collectRateRefIds([siteInput]);
  await verifyIdsExist("shift", shiftIds);
  await verifyIdsExist("position", positionIds);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await repo.addContractSite(tx, contractId, siteInput);
      await writeAudit(
        tx,
        actor,
        {
          action: "contract.site.add",
          module: "contracts",
          recordId: contractId,
          newValue: toSiteDto(row),
        },
        req,
      );
      return row;
    });
    return toSiteDto(created);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(
        "CONTRACT_SITE_EXISTS",
        "This site/service type is already on the contract",
        409,
      );
    }
    throw err;
  }
}

export async function removeSite(
  actor: Actor,
  contractSiteId: string,
  req?: Request,
): Promise<{ removed: boolean; id: string }> {
  const cs = await repo.getContractSiteWithContract(prisma, contractSiteId);
  if (!cs) {
    throw new ApiError("CONTRACT_SITE_NOT_FOUND", "Contract site not found", 404);
  }
  assertDraft(cs.contract, "remove site");

  const oldValue = toSiteDto(cs);
  await prisma.$transaction(async (tx) => {
    await repo.removeContractSite(tx, contractSiteId);
    await writeAudit(
      tx,
      actor,
      {
        action: "contract.site.remove",
        module: "contracts",
        recordId: cs.contractId,
        oldValue,
      },
      req,
    );
  });
  return { removed: true, id: contractSiteId };
}

// ------------------------- Rates -------------------------

export async function addRate(
  actor: Actor,
  contractSiteId: string,
  rateInput: AddRateInput,
  req?: Request,
): Promise<ContractRateDto> {
  const cs = await repo.getContractSiteWithContract(prisma, contractSiteId);
  if (!cs) {
    throw new ApiError("CONTRACT_SITE_NOT_FOUND", "Contract site not found", 404);
  }
  assertDraft(cs.contract, "add rate");
  const { shiftIds, positionIds } = collectRateRefIds([rateInput]);
  await verifyIdsExist("shift", shiftIds);
  await verifyIdsExist("position", positionIds);

  const created = await prisma.$transaction(async (tx) => {
    const row = await repo.addRate(tx, contractSiteId, rateInput);
    await writeAudit(
      tx,
      actor,
      {
        action: "contract.rate.add",
        module: "contracts",
        recordId: cs.contractId,
        newValue: toRateDto(row),
      },
      req,
    );
    return row;
  });
  return toRateDto(created);
}

export async function removeRate(
  actor: Actor,
  rateId: string,
  req?: Request,
): Promise<{ removed: boolean; id: string }> {
  const rate = await repo.getRateWithContract(prisma, rateId);
  if (!rate) {
    throw new ApiError("CONTRACT_RATE_NOT_FOUND", "Contract rate not found", 404);
  }
  if (rate.contractSite.contract.status !== ContractStatus.DRAFT) {
    throw new ApiError(
      "CONTRACT_LOCKED",
      `Cannot remove rate: contract is ${rate.contractSite.contract.status}`,
      409,
    );
  }
  const contractId = rate.contractSite.contract.id;
  const oldValue = toRateDto(rate);
  await prisma.$transaction(async (tx) => {
    await repo.removeRate(tx, rateId);
    await writeAudit(
      tx,
      actor,
      {
        action: "contract.rate.remove",
        module: "contracts",
        recordId: contractId,
        oldValue,
      },
      req,
    );
  });
  return { removed: true, id: rateId };
}

// ------------------------- Delete / expiry -------------------------

export async function deleteContract(
  actor: Actor,
  id: string,
  req?: Request,
): Promise<{ deleted: boolean; id: string }> {
  const existing = await getContractOr404(id);
  assertDraft(existing, "delete contract");
  const invoiceCount = await repo.countInvoices(prisma, id);
  if (invoiceCount > 0) {
    throw new ApiError(
      "CONTRACT_HAS_INVOICES",
      `Cannot delete contract with ${invoiceCount} invoice(s)`,
      409,
      { invoiceCount },
    );
  }

  const oldValue = toContractDto(existing);
  await prisma.$transaction(async (tx) => {
    await repo.deleteContract(tx, id);
    await writeAudit(
      tx,
      actor,
      {
        action: "contract.delete",
        module: "contracts",
        recordId: id,
        oldValue,
      },
      req,
    );
  });
  return { deleted: true, id };
}

/**
 * Expire ACTIVE contracts whose endDate has passed. Returns how many
 * were moved to EXPIRED.
 */
export async function refreshExpiry(
  actor: Actor,
  req?: Request,
): Promise<{ expiredCount: number }> {
  const due = await repo.findExpiredDue(prisma, new Date());
  for (const c of due) {
    await prisma.$transaction(async (tx) => {
      await repo.setContractStatus(tx, c.id, ContractStatus.EXPIRED);
      await writeAudit(
        tx,
        actor,
        {
          action: "contract.status",
          module: "contracts",
          recordId: c.id,
          oldValue: { status: ContractStatus.ACTIVE },
          newValue: { status: ContractStatus.EXPIRED },
        },
        req,
      );
    });
  }
  return { expiredCount: due.length };
}
