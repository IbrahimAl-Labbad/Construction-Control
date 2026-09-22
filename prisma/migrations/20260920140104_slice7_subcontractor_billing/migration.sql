-- CreateEnum
CREATE TYPE "SubcontractorBillingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "subcontractor_billings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "subcontractorName" VARCHAR(150) NOT NULL,
    "referenceNumber" VARCHAR(100),
    "billingPeriod" VARCHAR(100) NOT NULL,
    "claimDate" TIMESTAMPTZ NOT NULL,
    "grossAmount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "description" TEXT NOT NULL,
    "status" "SubcontractorBillingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMPTZ,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ,
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMPTZ,
    "rejectionReason" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subcontractor_billings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subcontractor_billings_projectId_status_idx" ON "subcontractor_billings"("projectId", "status");

-- CreateIndex
CREATE INDEX "subcontractor_billings_budgetLineId_status_idx" ON "subcontractor_billings"("budgetLineId", "status");

-- CreateIndex
CREATE INDEX "subcontractor_billings_commitmentId_status_idx" ON "subcontractor_billings"("commitmentId", "status");

-- CreateIndex
CREATE INDEX "subcontractor_billings_createdById_idx" ON "subcontractor_billings"("createdById");

-- CreateIndex
CREATE INDEX "subcontractor_billings_submittedById_idx" ON "subcontractor_billings"("submittedById");

-- CreateIndex
CREATE INDEX "subcontractor_billings_approvedById_idx" ON "subcontractor_billings"("approvedById");

-- CreateIndex
CREATE INDEX "subcontractor_billings_claimDate_idx" ON "subcontractor_billings"("claimDate");

-- CreateIndex
CREATE INDEX "subcontractor_billings_deletedAt_idx" ON "subcontractor_billings"("deletedAt");

-- AddForeignKey
ALTER TABLE "subcontractor_billings" ADD CONSTRAINT "subcontractor_billings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_billings" ADD CONSTRAINT "subcontractor_billings_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "budget_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_billings" ADD CONSTRAINT "subcontractor_billings_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "commitments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_billings" ADD CONSTRAINT "subcontractor_billings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_billings" ADD CONSTRAINT "subcontractor_billings_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_billings" ADD CONSTRAINT "subcontractor_billings_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_billings" ADD CONSTRAINT "subcontractor_billings_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddConstraint: grossAmount must be positive (financial integrity — AGENTS.md §13)
ALTER TABLE "subcontractor_billings"
  ADD CONSTRAINT "billing_gross_amount_positive"
  CHECK ("grossAmount" > 0);

-- CreateUniqueIndex: billing reference number unique per project when not null and not soft-deleted
-- Cannot be expressed as @@unique in Prisma due to nullability — raw partial index required.
-- billingPeriod has NO uniqueness constraint (descriptive text only — Decision #23).
CREATE UNIQUE INDEX "idx_billing_ref_per_project"
  ON "subcontractor_billings" ("projectId", "referenceNumber")
  WHERE "referenceNumber" IS NOT NULL
    AND "deletedAt" IS NULL;
