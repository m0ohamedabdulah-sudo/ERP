-- ============================================================
-- Easy Roster — initial migration: 0001_init
-- PostgreSQL DDL implementing prisma/schema.prisma (Phase 1)
-- ============================================================
-- NOTE (hand-written migration):
-- The Prisma CLI engines cannot run on this sandbox's Node 24, so this
-- migration was hand-written to faithfully implement the Prisma schema
-- (model/table names, enum values, constraints, and indexes match the
-- schema 1:1). Going forward, use `npx prisma migrate dev` for all new
-- migrations. If this file was applied via psql first, baseline it in
-- Prisma with:  npx prisma migrate resolve --applied 0001_init
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------- Enumerations -------------------------

CREATE TYPE "EmployeeStatus" AS ENUM (
  'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TRANSFERRED',
  'RESIGNED', 'TERMINATED', 'BLACKLISTED', 'EXCLUDED'
);

CREATE TYPE "LeaveType" AS ENUM (
  'ANNUAL', 'SICK', 'EMERGENCY', 'OTHER'
);

CREATE TYPE "LeaveStatus" AS ENUM (
  'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'
);

CREATE TYPE "TransferStatus" AS ENUM (
  'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'
);

CREATE TYPE "ShiftType" AS ENUM (
  'MORNING', 'EVENING', 'NIGHT', 'DOUBLE', 'CUSTOM'
);

CREATE TYPE "RosterStatus" AS ENUM (
  'DRAFT', 'PUBLISHED', 'LOCKED'
);

-- Operational attendance codes are stored exactly as operations teams
-- use them (P, PP, 12, 6, A, X, AL, SL).
CREATE TYPE "AttendanceCodeEnum" AS ENUM (
  'P', 'PP', '12', '6', 'A', 'X', 'AL', 'SL'
);

CREATE TYPE "ShortageSeverity" AS ENUM (
  'NORMAL', 'WARNING', 'CRITICAL'
);

-- ------------------------- Identity & Access -------------------------

CREATE TABLE "Company" (
  "id"        UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"      TEXT        NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE "Role" (
  "id"          UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"        TEXT        NOT NULL UNIQUE,
  "description" TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL
);

CREATE TABLE "Permission" (
  "id"          UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "key"         TEXT        NOT NULL UNIQUE,
  "module"      TEXT        NOT NULL,
  "description" TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "RolePermission" (
  "id"           UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "roleId"       UUID        NOT NULL REFERENCES "Role"("id") ON DELETE CASCADE,
  "permissionId" UUID        NOT NULL REFERENCES "Permission"("id") ON DELETE CASCADE,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "RolePermission_roleId_permissionId_key" UNIQUE ("roleId", "permissionId")
);
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

CREATE TABLE "User" (
  "id"           UUID           NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "email"        TEXT           NOT NULL UNIQUE,
  "passwordHash" TEXT           NOT NULL,
  "fullName"     TEXT           NOT NULL,
  "phone"        TEXT,
  "roleId"       UUID           NOT NULL REFERENCES "Role"("id") ON DELETE RESTRICT,
  "isActive"     BOOLEAN        NOT NULL DEFAULT true,
  "lastLoginAt"  TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ    NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ    NOT NULL,
  "deletedAt"    TIMESTAMPTZ
);
CREATE INDEX "User_roleId_idx" ON "User"("roleId");
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- ------------------------- Organization -------------------------

CREATE TABLE "Sector" (
  "id"          UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId"   UUID        NOT NULL REFERENCES "Company"("id") ON DELETE RESTRICT,
  "name"        TEXT        NOT NULL,
  "managerId"   UUID        REFERENCES "User"("id") ON DELETE SET NULL,
  "inspectorId" UUID        REFERENCES "User"("id") ON DELETE SET NULL,
  "isActive"    BOOLEAN     NOT NULL DEFAULT true,
  "notes"       TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL,
  "deletedAt"   TIMESTAMPTZ,
  CONSTRAINT "Sector_companyId_name_key" UNIQUE ("companyId", "name")
);
CREATE INDEX "Sector_companyId_idx" ON "Sector"("companyId");
CREATE INDEX "Sector_managerId_idx" ON "Sector"("managerId");
CREATE INDEX "Sector_inspectorId_idx" ON "Sector"("inspectorId");
CREATE INDEX "Sector_isActive_idx" ON "Sector"("isActive");

CREATE TABLE "Position" (
  "id"          UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "code"        TEXT        NOT NULL UNIQUE,
  "titleEn"     TEXT        NOT NULL,
  "titleAr"     TEXT        NOT NULL,
  "description" TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL
);

CREATE TABLE "Site" (
  "id"               UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "sectorId"         UUID        NOT NULL REFERENCES "Sector"("id") ON DELETE RESTRICT,
  "name"             TEXT        NOT NULL,
  "clientName"       TEXT,
  "managerId"        UUID        REFERENCES "User"("id") ON DELETE SET NULL,
  "inspectorId"      UUID        REFERENCES "User"("id") ON DELETE SET NULL,
  "requiredManpower" INTEGER     NOT NULL DEFAULT 0,
  "isActive"         BOOLEAN     NOT NULL DEFAULT true,
  "location"         TEXT,
  "contactName"      TEXT,
  "contactPhone"     TEXT,
  "notes"            TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ NOT NULL,
  "deletedAt"        TIMESTAMPTZ,
  CONSTRAINT "Site_sectorId_name_key" UNIQUE ("sectorId", "name")
);
COMMENT ON COLUMN "Site"."requiredManpower" IS
  'Cached denormalized total. Source of truth is ManpowerRequirement; refresh via the manpower service whenever requirements change.';
CREATE INDEX "Site_sectorId_idx" ON "Site"("sectorId");
CREATE INDEX "Site_managerId_idx" ON "Site"("managerId");
CREATE INDEX "Site_inspectorId_idx" ON "Site"("inspectorId");
CREATE INDEX "Site_isActive_idx" ON "Site"("isActive");

-- ------------------------- Workforce -------------------------

CREATE TABLE "Shift" (
  "id"            UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "siteId"        UUID        NOT NULL REFERENCES "Site"("id") ON DELETE CASCADE,
  "name"          TEXT        NOT NULL,
  "type"          "ShiftType" NOT NULL DEFAULT 'CUSTOM',
  "startTime"     TEXT        NOT NULL,
  "endTime"       TEXT        NOT NULL,
  "breakMinutes"  INTEGER     NOT NULL DEFAULT 0,
  "requiredStaff" INTEGER     NOT NULL DEFAULT 0,
  "isActive"      BOOLEAN     NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Shift_siteId_name_key" UNIQUE ("siteId", "name")
);
CREATE INDEX "Shift_siteId_idx" ON "Shift"("siteId");

CREATE TABLE "Employee" (
  "id"               UUID             NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "cardNumber"       TEXT             NOT NULL UNIQUE,
  "fullNameAr"       TEXT             NOT NULL,
  "fullNameEn"       TEXT             NOT NULL,
  "nationalId"       TEXT             NOT NULL UNIQUE,
  "mobile"           TEXT,
  "emergencyContact" TEXT,
  "dateOfBirth"      DATE,
  "hiringDate"       DATE             NOT NULL,
  "positionId"       UUID             REFERENCES "Position"("id") ON DELETE SET NULL,
  "rank"             TEXT,
  "department"       TEXT,
  "sectorId"         UUID             NOT NULL REFERENCES "Sector"("id") ON DELETE RESTRICT,
  "siteId"           UUID             NOT NULL REFERENCES "Site"("id") ON DELETE RESTRICT,
  "shiftId"          UUID             REFERENCES "Shift"("id") ON DELETE SET NULL,
  "salary"           DECIMAL(12, 2),
  "contractType"     TEXT,
  "insuranceStatus"  TEXT,
  "status"           "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastWorkingDay"   DATE,
  "exitReason"       TEXT,
  "notes"            TEXT,
  "createdAt"        TIMESTAMPTZ      NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ      NOT NULL,
  "deletedAt"        TIMESTAMPTZ
);
CREATE INDEX "Employee_positionId_idx" ON "Employee"("positionId");
CREATE INDEX "Employee_sectorId_idx" ON "Employee"("sectorId");
CREATE INDEX "Employee_siteId_idx" ON "Employee"("siteId");
CREATE INDEX "Employee_shiftId_idx" ON "Employee"("shiftId");
CREATE INDEX "Employee_status_idx" ON "Employee"("status");
CREATE INDEX "Employee_hiringDate_idx" ON "Employee"("hiringDate");

-- ------------------------- Roster -------------------------

CREATE TABLE "Roster" (
  "id"          UUID           NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "siteId"      UUID           NOT NULL REFERENCES "Site"("id") ON DELETE CASCADE,
  "name"        TEXT           NOT NULL,
  "startDate"   DATE           NOT NULL,
  "endDate"     DATE           NOT NULL,
  "status"      "RosterStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" UUID           NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "publishedAt" TIMESTAMPTZ,
  "lockedAt"    TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ    NOT NULL,
  "deletedAt"   TIMESTAMPTZ
);
CREATE INDEX "Roster_siteId_idx" ON "Roster"("siteId");
CREATE INDEX "Roster_status_idx" ON "Roster"("status");
CREATE INDEX "Roster_startDate_endDate_idx" ON "Roster"("startDate", "endDate");
CREATE INDEX "Roster_createdById_idx" ON "Roster"("createdById");

CREATE TABLE "RosterAssignment" (
  "id"         UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "rosterId"   UUID        NOT NULL REFERENCES "Roster"("id") ON DELETE CASCADE,
  "employeeId" UUID        NOT NULL REFERENCES "Employee"("id") ON DELETE CASCADE,
  "shiftId"    UUID        NOT NULL REFERENCES "Shift"("id") ON DELETE RESTRICT,
  "siteId"     UUID        NOT NULL REFERENCES "Site"("id") ON DELETE CASCADE,
  "date"       DATE        NOT NULL,
  "notes"      TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL,
  CONSTRAINT "RosterAssignment_rosterId_employeeId_date_shiftId_key"
    UNIQUE ("rosterId", "employeeId", "date", "shiftId")
);
CREATE INDEX "RosterAssignment_rosterId_idx" ON "RosterAssignment"("rosterId");
CREATE INDEX "RosterAssignment_employeeId_idx" ON "RosterAssignment"("employeeId");
CREATE INDEX "RosterAssignment_shiftId_idx" ON "RosterAssignment"("shiftId");
CREATE INDEX "RosterAssignment_siteId_date_idx" ON "RosterAssignment"("siteId", "date");

-- ------------------------- Attendance -------------------------

CREATE TABLE "AttendanceCode" (
  "id"              UUID                 NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "code"            "AttendanceCodeEnum" NOT NULL UNIQUE,
  "labelEn"         TEXT                 NOT NULL,
  "labelAr"         TEXT                 NOT NULL,
  "dayValue"        DECIMAL(4, 2)        NOT NULL,
  "countsAsPresent" BOOLEAN              NOT NULL DEFAULT true,
  "isActive"        BOOLEAN              NOT NULL DEFAULT true,
  "sortOrder"       INTEGER              NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMPTZ          NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ          NOT NULL
);

CREATE TABLE "Attendance" (
  "id"         UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "employeeId" UUID        NOT NULL REFERENCES "Employee"("id") ON DELETE CASCADE,
  "siteId"     UUID        NOT NULL REFERENCES "Site"("id") ON DELETE CASCADE,
  "date"       DATE        NOT NULL,
  "codeId"     UUID        NOT NULL REFERENCES "AttendanceCode"("id") ON DELETE RESTRICT,
  "shiftId"    UUID        REFERENCES "Shift"("id") ON DELETE SET NULL,
  "notes"      TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL,
  CONSTRAINT "Attendance_employeeId_date_key" UNIQUE ("employeeId", "date")
);
CREATE INDEX "Attendance_employeeId_idx" ON "Attendance"("employeeId");
CREATE INDEX "Attendance_siteId_date_idx" ON "Attendance"("siteId", "date");
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");
CREATE INDEX "Attendance_codeId_idx" ON "Attendance"("codeId");
CREATE INDEX "Attendance_shiftId_idx" ON "Attendance"("shiftId");

-- ------------------------- Leave & Transfers -------------------------

CREATE TABLE "Leave" (
  "id"         UUID          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "employeeId" UUID          NOT NULL REFERENCES "Employee"("id") ON DELETE CASCADE,
  "type"       "LeaveType"   NOT NULL,
  "startDate"  DATE          NOT NULL,
  "endDate"    DATE          NOT NULL,
  "days"       INTEGER       NOT NULL,
  "status"     "LeaveStatus" NOT NULL DEFAULT 'PENDING',
  "approverId" UUID          REFERENCES "User"("id") ON DELETE SET NULL,
  "notes"      TEXT,
  "createdAt"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ   NOT NULL,
  "deletedAt"  TIMESTAMPTZ
);
CREATE INDEX "Leave_employeeId_idx" ON "Leave"("employeeId");
CREATE INDEX "Leave_status_idx" ON "Leave"("status");
CREATE INDEX "Leave_startDate_endDate_idx" ON "Leave"("startDate", "endDate");
CREATE INDEX "Leave_approverId_idx" ON "Leave"("approverId");

CREATE TABLE "Transfer" (
  "id"            UUID             NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "employeeId"    UUID             NOT NULL REFERENCES "Employee"("id") ON DELETE CASCADE,
  "fromSectorId"  UUID             NOT NULL REFERENCES "Sector"("id") ON DELETE RESTRICT,
  "fromSiteId"    UUID             NOT NULL REFERENCES "Site"("id") ON DELETE RESTRICT,
  "fromShiftId"   UUID             REFERENCES "Shift"("id") ON DELETE SET NULL,
  "toSectorId"    UUID             NOT NULL REFERENCES "Sector"("id") ON DELETE RESTRICT,
  "toSiteId"      UUID             NOT NULL REFERENCES "Site"("id") ON DELETE RESTRICT,
  "toShiftId"     UUID             REFERENCES "Shift"("id") ON DELETE SET NULL,
  "requesterId"   UUID             NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "approverId"    UUID             REFERENCES "User"("id") ON DELETE SET NULL,
  "requestedAt"   TIMESTAMPTZ      NOT NULL DEFAULT now(),
  "effectiveDate" DATE             NOT NULL,
  "reason"        TEXT,
  "status"        "TransferStatus" NOT NULL DEFAULT 'PENDING',
  "notes"         TEXT,
  "createdAt"     TIMESTAMPTZ      NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ      NOT NULL
);
CREATE INDEX "Transfer_employeeId_idx" ON "Transfer"("employeeId");
CREATE INDEX "Transfer_fromSectorId_idx" ON "Transfer"("fromSectorId");
CREATE INDEX "Transfer_fromSiteId_idx" ON "Transfer"("fromSiteId");
CREATE INDEX "Transfer_toSectorId_idx" ON "Transfer"("toSectorId");
CREATE INDEX "Transfer_toSiteId_idx" ON "Transfer"("toSiteId");
CREATE INDEX "Transfer_requesterId_idx" ON "Transfer"("requesterId");
CREATE INDEX "Transfer_approverId_idx" ON "Transfer"("approverId");
CREATE INDEX "Transfer_status_idx" ON "Transfer"("status");
CREATE INDEX "Transfer_effectiveDate_idx" ON "Transfer"("effectiveDate");

-- ------------------------- Manpower & Shortage -------------------------

CREATE TABLE "ManpowerRequirement" (
  "id"            UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "siteId"        UUID        NOT NULL REFERENCES "Site"("id") ON DELETE CASCADE,
  "shiftId"       UUID        REFERENCES "Shift"("id") ON DELETE SET NULL,
  "requiredCount" INTEGER     NOT NULL,
  "effectiveFrom" DATE        NOT NULL,
  "effectiveTo"   DATE,
  "notes"         TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ManpowerRequirement_siteId_idx" ON "ManpowerRequirement"("siteId");
CREATE INDEX "ManpowerRequirement_shiftId_idx" ON "ManpowerRequirement"("shiftId");
CREATE INDEX "ManpowerRequirement_effectiveFrom_idx" ON "ManpowerRequirement"("effectiveFrom");

CREATE TABLE "ManpowerSnapshot" (
  "id"            UUID          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "siteId"        UUID          NOT NULL REFERENCES "Site"("id") ON DELETE CASCADE,
  "date"          DATE          NOT NULL,
  "requiredCount" INTEGER       NOT NULL,
  "actualCount"   INTEGER       NOT NULL,
  "shortage"      INTEGER       NOT NULL,
  "surplus"       INTEGER       NOT NULL DEFAULT 0,
  "shortagePct"   DECIMAL(5, 2) NOT NULL,
  "createdAt"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT "ManpowerSnapshot_siteId_date_key" UNIQUE ("siteId", "date")
);
COMMENT ON COLUMN "ManpowerSnapshot"."shortage" IS
  'requiredCount - actualCount. Negative means surplus; see surplus column.';
CREATE INDEX "ManpowerSnapshot_siteId_idx" ON "ManpowerSnapshot"("siteId");
CREATE INDEX "ManpowerSnapshot_date_idx" ON "ManpowerSnapshot"("date");

CREATE TABLE "Shortage" (
  "id"           UUID               NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "siteId"       UUID               NOT NULL REFERENCES "Site"("id") ON DELETE CASCADE,
  "shiftId"      UUID               NOT NULL REFERENCES "Shift"("id") ON DELETE CASCADE,
  "date"         DATE               NOT NULL,
  "required"     INTEGER            NOT NULL,
  "actual"       INTEGER            NOT NULL,
  "shortage"     INTEGER            NOT NULL,
  "surplus"      INTEGER            NOT NULL DEFAULT 0,
  "percentage"   DECIMAL(5, 2)      NOT NULL,
  "severity"     "ShortageSeverity" NOT NULL,
  "acknowledged" BOOLEAN            NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMPTZ        NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ        NOT NULL,
  CONSTRAINT "Shortage_siteId_shiftId_date_key" UNIQUE ("siteId", "shiftId", "date")
);
COMMENT ON COLUMN "Shortage"."shortage" IS
  'required - actual. Negative means surplus; see surplus column.';
COMMENT ON COLUMN "Shortage"."percentage" IS
  'shortage / required * 100. Severity thresholds are configurable per company (Settings); demo defaults: 0% NORMAL, 1-10% WARNING, >10% CRITICAL.';
CREATE INDEX "Shortage_siteId_idx" ON "Shortage"("siteId");
CREATE INDEX "Shortage_shiftId_idx" ON "Shortage"("shiftId");
CREATE INDEX "Shortage_siteId_date_idx" ON "Shortage"("siteId", "date");
CREATE INDEX "Shortage_severity_idx" ON "Shortage"("severity");

-- ------------------------- Payroll -------------------------

CREATE TABLE "PayrollRecord" (
  "id"                UUID          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "employeeId"        UUID          NOT NULL REFERENCES "Employee"("id") ON DELETE CASCADE,
  "periodYear"        INTEGER       NOT NULL,
  "periodMonth"       INTEGER       NOT NULL,
  "basicSalary"       DECIMAL(12, 2) NOT NULL,
  "attendanceDays"    DECIMAL(6, 2)  NOT NULL,
  "totalP"            DECIMAL(6, 2)  NOT NULL,
  "absenceDays"       DECIMAL(6, 2)  NOT NULL,
  "doubleAbsenceDays" INTEGER        NOT NULL DEFAULT 0,
  "leaveDays"         INTEGER        NOT NULL DEFAULT 0,
  "overtimeHours"     DECIMAL(6, 2)  NOT NULL DEFAULT 0,
  "deductions"        DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "advances"          DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "netPay"            DECIMAL(12, 2) NOT NULL,
  "status"            TEXT           NOT NULL DEFAULT 'DRAFT',
  "computedAt"        TIMESTAMPTZ,
  "createdAt"         TIMESTAMPTZ    NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMPTZ    NOT NULL,
  CONSTRAINT "PayrollRecord_employeeId_periodYear_periodMonth_key"
    UNIQUE ("employeeId", "periodYear", "periodMonth")
);
CREATE INDEX "PayrollRecord_employeeId_idx" ON "PayrollRecord"("employeeId");
CREATE INDEX "PayrollRecord_periodYear_periodMonth_idx" ON "PayrollRecord"("periodYear", "periodMonth");

-- ------------------------- Platform -------------------------

CREATE TABLE "Notification" (
  "id"            UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"        UUID        REFERENCES "User"("id") ON DELETE CASCADE,
  "type"          TEXT        NOT NULL,
  "title"         TEXT        NOT NULL,
  "titleAr"       TEXT,
  "body"          TEXT,
  "bodyAr"        TEXT,
  "relatedModule" TEXT,
  "relatedId"     UUID,
  "isRead"        BOOLEAN     NOT NULL DEFAULT false,
  "readAt"        TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON COLUMN "Notification"."userId" IS 'NULL means broadcast to all users.';
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

CREATE TABLE "AuditLog" (
  "id"        UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"    UUID        REFERENCES "User"("id") ON DELETE SET NULL,
  "action"    TEXT        NOT NULL,
  "module"    TEXT        NOT NULL,
  "recordId"  TEXT,
  "oldValue"  JSONB,
  "newValue"  JSONB,
  "ip"        TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE "AuditLog" IS
  'Append-only. Every mutating API call must write a row here; rows are never updated or deleted by application code.';
CREATE INDEX "AuditLog_module_recordId_idx" ON "AuditLog"("module", "recordId");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE TABLE "AIInsight" (
  "id"          UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "type"        TEXT        NOT NULL,
  "title"       TEXT        NOT NULL,
  "summary"     TEXT,
  "payload"     JSONB       NOT NULL,
  "siteId"      UUID        REFERENCES "Site"("id") ON DELETE SET NULL,
  "sectorId"    UUID        REFERENCES "Sector"("id") ON DELETE SET NULL,
  "generatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdBy"   TEXT        NOT NULL DEFAULT 'system',
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON COLUMN "AIInsight"."payload" IS
  'Structured insight: DATA -> ANALYSIS -> PREDICTION -> EXPLANATION. AI never mutates employee or payroll data directly.';
CREATE INDEX "AIInsight_siteId_idx" ON "AIInsight"("siteId");
CREATE INDEX "AIInsight_sectorId_idx" ON "AIInsight"("sectorId");
CREATE INDEX "AIInsight_type_generatedAt_idx" ON "AIInsight"("type", "generatedAt");

-- ------------------------- Seed: attendance codes -------------------------
-- CONFIGURABLE BUSINESS RULES. These 8 operational codes and their
-- day-values are data, not application logic: payroll and attendance
-- calculations must read dayValue / countsAsPresent from this table,
-- never hard-code them. ON CONFLICT DO NOTHING keeps the migration
-- idempotent so it can be re-run safely.

INSERT INTO "AttendanceCode" ("code", "labelEn", "labelAr", "dayValue", "countsAsPresent", "sortOrder")
VALUES
  ('P',  'Present',                 'حاضر',              1.00, true,  1),
  ('PP', 'Present — Double Shift',  'حاضر — ورديتان',    2.00, true,  2),
  ('12', 'One and a Half Shift',    'وردية ونصف',        1.50, true,  3),
  ('6',  'Half Shift',              'نصف وردية',         0.50, true,  4),
  ('A',  'Absent',                  'غياب',              0.00, false, 5),
  ('X',  'Double Absence',          'غياب مضاعف',       -2.00, false, 6),
  ('AL', 'Annual Leave',            'إجازة سنوية',       0.00, false, 7),
  ('SL', 'Sick Leave',              'إجازة مرضية',       0.00, false, 8)
ON CONFLICT ("code") DO NOTHING;
