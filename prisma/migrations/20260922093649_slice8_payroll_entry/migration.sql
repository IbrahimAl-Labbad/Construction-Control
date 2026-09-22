-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "payroll_entries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "workerName" VARCHAR(100) NOT NULL,
    "workerReference" VARCHAR(50),
    "tradeOrTitle" VARCHAR(50),
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "description" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
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

    CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_entries_projectId_status_idx" ON "payroll_entries"("projectId", "status");

-- CreateIndex
CREATE INDEX "payroll_entries_budgetLineId_status_idx" ON "payroll_entries"("budgetLineId", "status");

-- CreateIndex
CREATE INDEX "payroll_entries_periodYear_periodMonth_idx" ON "payroll_entries"("periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "payroll_entries_createdById_idx" ON "payroll_entries"("createdById");

-- CreateIndex
CREATE INDEX "payroll_entries_approvedById_idx" ON "payroll_entries"("approvedById");

-- CreateIndex
CREATE INDEX "payroll_entries_deletedAt_idx" ON "payroll_entries"("deletedAt");

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "budget_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddConstraint: amount must be positive (financial integrity — AGENTS.md §13)
ALTER TABLE "payroll_entries"
  ADD CONSTRAINT "payroll_entries_amount_positive"
  CHECK ("amount" > 0);

-- AddConstraint: periodMonth must be between 1 and 12
ALTER TABLE "payroll_entries"
  ADD CONSTRAINT "payroll_entries_month_range"
  CHECK ("periodMonth" >= 1 AND "periodMonth" <= 12);

-- AddConstraint: periodYear must be between 2020 and 2050
ALTER TABLE "payroll_entries"
  ADD CONSTRAINT "payroll_entries_year_range"
  CHECK ("periodYear" >= 2020 AND "periodYear" <= 2050);

-- AddConstraint: currency must be SAR (AGENTS.md §13.1)
ALTER TABLE "payroll_entries"
  ADD CONSTRAINT "payroll_entries_currency_sar"
  CHECK ("currency" = 'SAR');

