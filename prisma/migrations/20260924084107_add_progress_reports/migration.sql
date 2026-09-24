-- CreateEnum
CREATE TYPE "ProgressReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "progress_reports" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "workDescription" TEXT NOT NULL,
    "progressPercentage" INTEGER,
    "blockers" TEXT,
    "nextPeriodPlan" TEXT,
    "weatherCondition" VARCHAR(100),
    "status" "ProgressReportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMPTZ,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ,
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMPTZ,
    "rejectionReason" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMPTZ,
    "cancellationReason" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "progress_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "progress_reports_projectId_status_idx" ON "progress_reports"("projectId", "status");

-- CreateIndex
CREATE INDEX "progress_reports_createdById_status_idx" ON "progress_reports"("createdById", "status");

-- CreateIndex
CREATE INDEX "progress_reports_reportDate_idx" ON "progress_reports"("reportDate");

-- CreateIndex
CREATE INDEX "progress_reports_deletedAt_idx" ON "progress_reports"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "progress_reports_projectId_reportDate_createdById_key" ON "progress_reports"("projectId", "reportDate", "createdById");

-- AddForeignKey
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
