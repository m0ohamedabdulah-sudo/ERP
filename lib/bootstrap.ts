/**
 * Canonical RBAC bootstrap — the single source of truth for the
 * permission catalog and seed roles.
 *
 * Used by:
 *  - prisma/seed.ts (demo seed)
 *  - POST /api/v1/setup (first-run production bootstrap)
 *
 * Idempotent: everything is upserted on unique keys, so re-running is
 * safe. SUPER_ADMIN always ends up holding every permission.
 */
import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface PermissionDef {
  key: string;
  module: string;
  description: string;
}

export const PERMISSIONS: PermissionDef[] = [
  { key: "employees.view", module: "employees", description: "View employees" },
  { key: "employees.create", module: "employees", description: "Create employees" },
  { key: "employees.edit", module: "employees", description: "Edit employees" },
  { key: "employees.delete", module: "employees", description: "Delete employees" },
  { key: "attendance.view", module: "attendance", description: "View attendance" },
  { key: "attendance.edit", module: "attendance", description: "Edit attendance" },
  { key: "attendance.approve", module: "attendance", description: "Approve attendance" },
  { key: "sites.view", module: "sites", description: "View sites" },
  { key: "sites.manage", module: "sites", description: "Manage sites and manpower" },
  { key: "roster.view", module: "roster", description: "View rosters and shifts" },
  { key: "roster.manage", module: "roster", description: "Create and publish rosters, manage shifts" },
  { key: "users.view", module: "users", description: "View users and roles" },
  { key: "users.manage", module: "users", description: "Create and manage users, assign roles and permissions" },
  { key: "audit.view", module: "audit", description: "View audit logs" },
  { key: "reports.view", module: "reports", description: "View reports" },
  { key: "reports.export", module: "reports", description: "Export reports" },
  { key: "payroll.view", module: "payroll", description: "View payroll data" },
  { key: "payroll.manage", module: "payroll", description: "Manage payroll data" },
  // --- Security ERP Phase 1: clients / contracts / billing ---------------
  { key: "clients.view", module: "clients", description: "View clients" },
  { key: "clients.create", module: "clients", description: "Create clients" },
  { key: "clients.edit", module: "clients", description: "Edit clients" },
  { key: "clients.delete", module: "clients", description: "Delete clients" },
  { key: "contracts.view", module: "contracts", description: "View contracts" },
  { key: "contracts.create", module: "contracts", description: "Create contracts" },
  { key: "contracts.edit", module: "contracts", description: "Edit contracts and transitions" },
  { key: "contracts.delete", module: "contracts", description: "Delete draft contracts" },
  { key: "invoices.view", module: "invoices", description: "View invoices" },
  { key: "invoices.create", module: "invoices", description: "Generate invoices" },
  { key: "invoices.manage", module: "invoices", description: "Issue, send, cancel, recalculate invoices" },
  { key: "payments.view", module: "payments", description: "View payments" },
  { key: "payments.create", module: "payments", description: "Record payments" },
  // --- Security ERP Phase 2: recruitment / compliance ----------------------
  { key: "recruitment.view", module: "recruitment", description: "View candidates and pipeline" },
  { key: "recruitment.create", module: "recruitment", description: "Create candidates" },
  { key: "recruitment.edit", module: "recruitment", description: "Edit candidates, interviews, transitions" },
  { key: "recruitment.delete", module: "recruitment", description: "Delete candidates" },
  { key: "recruitment.hire", module: "recruitment", description: "Hire approved candidates" },
  { key: "compliance.view", module: "compliance", description: "View document types, documents, summaries" },
  { key: "compliance.manage", module: "compliance", description: "Document-type CRUD, document writes, expiry sweep" },
  { key: "compliance.verify", module: "compliance", description: "Verify candidate/employee documents" },
  { key: "compliance.override", module: "compliance", description: "Hire despite compliance issues (audited)" },
  // --- Batch 1: Operations Command Center -------------------------------
  { key: "operations.view", module: "operations", description: "View the live operations command center board" },
  { key: "checkin.manage", module: "operations", description: "Manual guard check-in / check-out by supervisors" },
  { key: "checkin.qr", module: "operations", description: "View and rotate site QR check-in tokens" },
];

export const ROLES = [
  { name: "SUPER_ADMIN", description: "Full system access" },
  { name: "ADMIN", description: "Administration" },
  { name: "HR_MANAGER", description: "HR management" },
  { name: "OPERATIONS_MANAGER", description: "Operations management" },
  { name: "SECTOR_MANAGER", description: "Sector management" },
  { name: "SITE_MANAGER", description: "Site management" },
  { name: "INSPECTOR", description: "Site inspection" },
  { name: "SUPERVISOR", description: "Shift supervision" },
  { name: "PAYROLL", description: "Payroll processing" },
  { name: "VIEWER", description: "Read-only access" },
] as const;

/**
 * Upsert the permission catalog and roles; grant every permission to
 * SUPER_ADMIN. Returns the SUPER_ADMIN role id.
 */
export async function ensureRolesAndPermissions(db: Db): Promise<string> {
  for (const p of PERMISSIONS) {
    await db.permission.upsert({
      where: { key: p.key },
      update: { module: p.module, description: p.description },
      create: p,
    });
  }
  const allPermissions = await db.permission.findMany();
  for (const r of ROLES) {
    const role = await db.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: { name: r.name, description: r.description },
    });
    if (r.name === "SUPER_ADMIN") {
      for (const p of allPermissions) {
        await db.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
          update: {},
          create: { roleId: role.id, permissionId: p.id },
        });
      }
      return role.id;
    }
  }
  throw new Error("SUPER_ADMIN role missing from ROLES");
}
