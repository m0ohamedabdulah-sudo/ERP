import type {
  Client,
  ClientContact,
  Prisma,
} from "@prisma/client";
import { ClientStatus } from "@prisma/client";
import type { Db } from "../../lib/audit";

/**
 * Client repository — Prisma queries only. No auth, no business logic,
 * no auditing here. Every function takes the root client or a
 * transaction client (`Db`) so callers can compose transactions.
 */

export type ClientWithContacts = Client & { contacts: ClientContact[] };

export interface ContactCreateInput {
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
}

export interface ClientCreateInput {
  companyNameAr: string;
  companyNameEn: string;
  taxId?: string | null;
  commercialReg?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: ClientStatus;
  notes?: string | null;
  contacts: ContactCreateInput[];
}

export interface ClientUpdateInput {
  companyNameAr?: string;
  companyNameEn?: string;
  taxId?: string | null;
  commercialReg?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: ClientStatus;
  notes?: string | null;
}

export interface ListClientsFilters {
  skip: number;
  take: number;
  search?: string;
  status?: ClientStatus;
}

const contactsOrdered = {
  contacts: { orderBy: { isPrimary: "desc" as const } },
} as const;

export async function listClients(
  db: Db,
  filters: ListClientsFilters,
): Promise<{ rows: ClientWithContacts[]; total: number }> {
  const { skip, take, search, status } = filters;

  const where: Prisma.ClientWhereInput = {};
  if (search) {
    where.OR = [
      { companyNameAr: { contains: search, mode: "insensitive" } },
      { companyNameEn: { contains: search, mode: "insensitive" } },
      { taxId: { contains: search, mode: "insensitive" } },
      { commercialReg: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status) {
    where.status = status;
  }

  const [rows, total] = await Promise.all([
    db.client.findMany({
      where,
      skip,
      take,
      orderBy: { companyNameEn: "asc" },
      include: contactsOrdered,
    }),
    db.client.count({ where }),
  ]);

  return { rows, total };
}

export async function getClientById(
  db: Db,
  id: string,
): Promise<ClientWithContacts | null> {
  return db.client.findUnique({
    where: { id },
    include: contactsOrdered,
  });
}

export async function createClient(
  db: Db,
  data: ClientCreateInput,
): Promise<ClientWithContacts> {
  return db.client.create({
    data: {
      companyNameAr: data.companyNameAr,
      companyNameEn: data.companyNameEn,
      taxId: data.taxId ?? null,
      commercialReg: data.commercialReg ?? null,
      address: data.address ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      status: data.status ?? ClientStatus.ACTIVE,
      notes: data.notes ?? null,
      contacts: {
        create: data.contacts.map((c) => ({
          name: c.name,
          role: c.role ?? null,
          phone: c.phone ?? null,
          email: c.email ?? null,
          isPrimary: c.isPrimary ?? false,
        })),
      },
    },
    include: contactsOrdered,
  });
}

export async function updateClient(
  db: Db,
  id: string,
  data: ClientUpdateInput,
): Promise<ClientWithContacts> {
  return db.client.update({
    where: { id },
    data: {
      ...(data.companyNameAr !== undefined
        ? { companyNameAr: data.companyNameAr }
        : {}),
      ...(data.companyNameEn !== undefined
        ? { companyNameEn: data.companyNameEn }
        : {}),
      ...(data.taxId !== undefined ? { taxId: data.taxId } : {}),
      ...(data.commercialReg !== undefined
        ? { commercialReg: data.commercialReg }
        : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
    include: contactsOrdered,
  });
}

export async function deleteClient(db: Db, id: string): Promise<void> {
  await db.client.delete({ where: { id } });
}

/** Number of contracts referencing this client — delete guard. */
export async function countContracts(
  db: Db,
  clientId: string,
): Promise<number> {
  return db.contract.count({ where: { clientId } });
}
