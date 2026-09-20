-- CreateEnum
CREATE TYPE "CustodyStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'ISSUED', 'PARTIALLY_SETTLED', 'SETTLED', 'CLOSED');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "custodyId" TEXT;

-- CreateTable
CREATE TABLE "custodies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "custodianUserId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "purpose" TEXT NOT NULL,
    "status" "CustodyStatus" NOT NULL DEFAULT 'DRAFT',
    "cashReturnedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
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
    "issuedById" TEXT,
    "issuedAt" TIMESTAMPTZ,
    "settledAt" TIMESTAMPTZ,
    "closedById" TEXT,
    "closedAt" TIMESTAMPTZ,
    "expectedSettlementDate" TIMESTAMPTZ,
    "deletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "custodies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custodies_code_key" ON "custodies"("code");

-- CreateIndex
CREATE INDEX "custodies_projectId_status_idx" ON "custodies"("projectId", "status");

-- CreateIndex
CREATE INDEX "custodies_budgetLineId_status_idx" ON "custodies"("budgetLineId", "status");

-- CreateIndex
CREATE INDEX "custodies_custodianUserId_idx" ON "custodies"("custodianUserId");

-- CreateIndex
CREATE INDEX "custodies_createdById_idx" ON "custodies"("createdById");

-- CreateIndex
CREATE INDEX "custodies_submittedById_idx" ON "custodies"("submittedById");

-- CreateIndex
CREATE INDEX "custodies_approvedById_idx" ON "custodies"("approvedById");

-- CreateIndex
CREATE INDEX "custodies_issuedById_idx" ON "custodies"("issuedById");

-- CreateIndex
CREATE INDEX "custodies_status_idx" ON "custodies"("status");

-- CreateIndex
CREATE INDEX "custodies_deletedAt_idx" ON "custodies"("deletedAt");

-- CreateIndex
CREATE INDEX "expenses_custodyId_idx" ON "expenses"("custodyId");

-- CreateIndex (Partial Unique Index: At most 1 active/unsettled custody per custodian per project)
CREATE UNIQUE INDEX "unique_active_custody_per_custodian" ON "custodies" ("projectId", "custodianUserId")
WHERE "status" IN ('SUBMITTED', 'APPROVED', 'ISSUED', 'PARTIALLY_SETTLED') AND "deletedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_custodyId_fkey" FOREIGN KEY ("custodyId") REFERENCES "custodies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "budget_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_custodianUserId_fkey" FOREIGN KEY ("custodianUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodies" ADD CONSTRAINT "custodies_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
