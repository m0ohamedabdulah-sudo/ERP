import { ApiError } from "../../lib/api-response";
import { pageMeta } from "../../lib/pagination";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../lib/audit";
import type { Actor } from "../../lib/auth";
import {
  listClients as repoList,
  getClientById as repoGet,
  createClient as repoCreate,
  updateClient as repoUpdate,
  deleteClient as repoDelete,
  countContracts,
  type ClientWithContacts,
} from "./client.repository";
import type {
  ClientQuery,
  CreateClientInput,
  UpdateClientInput,
} from "./client.schema";

/**
 * Client business logic + audit. Framework-agnostic: receives the
 * parsed input and the authenticated `Actor` — no auth checks here
 * (the controller enforces permissions).
 */

/** Plain-JSON client DTO (Date objects serialized to ISO strings). */
export interface ClientContactDto {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

export interface ClientDto {
  id: string;
  companyNameAr: string;
  companyNameEn: string;
  taxId: string | null;
  commercialReg: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  notes: string | null;
  contacts: ClientContactDto[];
  createdAt: string;
  updatedAt: string;
}

function toDto(row: ClientWithContacts): ClientDto {
  return {
    id: row.id,
    companyNameAr: row.companyNameAr,
    companyNameEn: row.companyNameEn,
    taxId: row.taxId,
    commercialReg: row.commercialReg,
    address: row.address,
    phone: row.phone,
    email: row.email,
    status: row.status,
    notes: row.notes,
    contacts: row.contacts.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      phone: c.phone,
      email: c.email,
      isPrimary: c.isPrimary,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listClients(query: ClientQuery): Promise<{
  data: ClientDto[];
  page: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const { page, pageSize } = query;
  const { rows, total } = await repoList(prisma, {
    skip: (page - 1) * pageSize,
    take: pageSize,
    search: query.search || undefined,
    status: query.status,
  });
  return {
    data: rows.map(toDto),
    page: pageMeta(page, pageSize, total),
  };
}

export async function getClient(id: string): Promise<ClientDto> {
  const row = await repoGet(prisma, id);
  if (!row) {
    throw new ApiError("NOT_FOUND", "Client not found", 404);
  }
  return toDto(row);
}

export async function createClient(
  actor: Actor,
  input: CreateClientInput,
  req?: Request,
): Promise<ClientDto> {
  const created = await prisma.$transaction(async (tx) => {
    const row = await repoCreate(tx, input);
    await writeAudit(
      tx,
      actor,
      {
        action: "client.create",
        module: "clients",
        recordId: row.id,
        newValue: toDto(row),
      },
      req,
    );
    return row;
  });
  return toDto(created);
}

export async function updateClient(
  actor: Actor,
  id: string,
  input: UpdateClientInput,
  req?: Request,
): Promise<ClientDto> {
  const existing = await repoGet(prisma, id);
  if (!existing) {
    throw new ApiError("NOT_FOUND", "Client not found", 404);
  }
  const updated = await prisma.$transaction(async (tx) => {
    const row = await repoUpdate(tx, id, input);
    await writeAudit(
      tx,
      actor,
      {
        action: "client.update",
        module: "clients",
        recordId: id,
        oldValue: toDto(existing),
        newValue: toDto(row),
      },
      req,
    );
    return row;
  });
  return toDto(updated);
}

export async function deleteClient(
  actor: Actor,
  id: string,
  req?: Request,
): Promise<void> {
  const existing = await repoGet(prisma, id);
  if (!existing) {
    throw new ApiError("NOT_FOUND", "Client not found", 404);
  }
  const contracts = await countContracts(prisma, id);
  if (contracts > 0) {
    throw new ApiError(
      "CLIENT_HAS_CONTRACTS",
      "Client has contracts and cannot be deleted",
      409,
    );
  }
  await prisma.$transaction(async (tx) => {
    await repoDelete(tx, id);
    await writeAudit(
      tx,
      actor,
      {
        action: "client.delete",
        module: "clients",
        recordId: id,
        oldValue: toDto(existing),
      },
      req,
    );
  });
}
