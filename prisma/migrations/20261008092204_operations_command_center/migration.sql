-- CreateEnum
CREATE TYPE "CheckinMethod" AS ENUM ('QR', 'MANUAL');

-- CreateTable
CREATE TABLE "SiteCheckin" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "shiftId" UUID,
    "checkedInAt" TIMESTAMP(3) NOT NULL,
    "checkedOutAt" TIMESTAMP(3),
    "method" "CheckinMethod" NOT NULL DEFAULT 'QR',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteQrToken" (
    "id" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteQrToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteCheckin_employeeId_idx" ON "SiteCheckin"("employeeId");

-- CreateIndex
CREATE INDEX "SiteCheckin_siteId_idx" ON "SiteCheckin"("siteId");

-- CreateIndex
CREATE INDEX "SiteCheckin_checkedInAt_idx" ON "SiteCheckin"("checkedInAt");

-- CreateIndex
CREATE INDEX "SiteCheckin_employeeId_checkedOutAt_idx" ON "SiteCheckin"("employeeId", "checkedOutAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiteQrToken_token_key" ON "SiteQrToken"("token");

-- CreateIndex
CREATE INDEX "SiteQrToken_siteId_idx" ON "SiteQrToken"("siteId");

-- CreateIndex
CREATE INDEX "SiteQrToken_active_expiresAt_idx" ON "SiteQrToken"("active", "expiresAt");

-- AddForeignKey
ALTER TABLE "SiteCheckin" ADD CONSTRAINT "SiteCheckin_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCheckin" ADD CONSTRAINT "SiteCheckin_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCheckin" ADD CONSTRAINT "SiteCheckin_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteQrToken" ADD CONSTRAINT "SiteQrToken_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
