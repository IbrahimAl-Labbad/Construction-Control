-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "commitments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "referenceNumber" VARCHAR(100),
    "vendorName" VARCHAR(150) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "description" TEXT NOT NULL,
    "commitmentDate" TIMESTAMPTZ NOT NULL,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'DRAFT',
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

    CONSTRAINT "commitments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commitments_projectId_status_idx" ON "commitments"("projectId", "status");

-- CreateIndex
CREATE INDEX "commitments_budgetLineId_status_idx" ON "commitments"("budgetLineId", "status");

-- CreateIndex
CREATE INDEX "commitments_createdById_idx" ON "commitments"("createdById");

-- CreateIndex
CREATE INDEX "commitments_submittedById_idx" ON "commitments"("submittedById");

-- CreateIndex
CREATE INDEX "commitments_approvedById_idx" ON "commitments"("approvedById");

-- CreateIndex
CREATE INDEX "commitments_commitmentDate_idx" ON "commitments"("commitmentDate");

-- CreateIndex
CREATE INDEX "commitments_deletedAt_idx" ON "commitments"("deletedAt");

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "budget_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
