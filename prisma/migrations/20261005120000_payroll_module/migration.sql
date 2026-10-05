-- Payroll module: adjustments (financial effects), payout method, bonus column.

-- Enums
CREATE TYPE "PayrollAdjustmentKind" AS ENUM ('FINE', 'CUT', 'ADVANCE', 'BONUS', 'ALLOWANCE');
CREATE TYPE "PayoutMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'E_WALLET');

-- AlterTable: bonus on payroll snapshots
ALTER TABLE "PayrollRecord" ADD COLUMN "bonus" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable: payout fields on employees
ALTER TABLE "Employee" ADD COLUMN "payoutMethod" "PayoutMethod" NOT NULL DEFAULT 'CASH';
ALTER TABLE "Employee" ADD COLUMN "bankAccount" TEXT;

-- CreateTable: manual per-month adjustments (financial effects)
CREATE TABLE "PayrollAdjustment" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "kind" "PayrollAdjustmentKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "PayrollAdjustment_employeeId_periodYear_periodMonth_idx" ON "PayrollAdjustment"("employeeId", "periodYear", "periodMonth");
CREATE INDEX "PayrollAdjustment_periodYear_periodMonth_idx" ON "PayrollAdjustment"("periodYear", "periodMonth");

-- Foreign key
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
