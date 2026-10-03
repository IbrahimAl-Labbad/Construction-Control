-- CreateEnum
CREATE TYPE "VariationOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "variation_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" VARCHAR(50) NOT NULL,
    "projectId" TEXT NOT NULL,
    "budgetLineId" TEXT,
    "commitmentId" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scopeImpact" TEXT,
    "status" "VariationOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "impactAmount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "requestedDate" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

    CONSTRAINT "variation_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variation_order_lines" (
    "id" TEXT NOT NULL,
    "variationOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "originalQuantity" DECIMAL(15,2) NOT NULL,
    "revisedQuantity" DECIMAL(15,2) NOT NULL,
    "quantityDelta" DECIMAL(15,2) NOT NULL,
    "originalRate" DECIMAL(15,2) NOT NULL,
    "revisedRate" DECIMAL(15,2) NOT NULL,
    "financialDelta" DECIMAL(15,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "variation_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "variation_orders_projectId_status_idx" ON "variation_orders"("projectId", "status");

-- CreateIndex
CREATE INDEX "variation_orders_budgetLineId_status_idx" ON "variation_orders"("budgetLineId", "status");

-- CreateIndex
CREATE INDEX "variation_orders_commitmentId_status_idx" ON "variation_orders"("commitmentId", "status");

-- CreateIndex
CREATE INDEX "variation_orders_createdById_idx" ON "variation_orders"("createdById");

-- CreateIndex
CREATE INDEX "variation_orders_approvedById_idx" ON "variation_orders"("approvedById");

-- CreateIndex
CREATE INDEX "variation_orders_deletedAt_idx" ON "variation_orders"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "variation_orders_projectId_orderNumber_key" ON "variation_orders"("projectId", "orderNumber");

-- CreateIndex
CREATE INDEX "variation_order_lines_variationOrderId_idx" ON "variation_order_lines"("variationOrderId");

-- AddForeignKey
ALTER TABLE "variation_orders" ADD CONSTRAINT "variation_orders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variation_orders" ADD CONSTRAINT "variation_orders_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "budget_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variation_orders" ADD CONSTRAINT "variation_orders_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "commitments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variation_orders" ADD CONSTRAINT "variation_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variation_orders" ADD CONSTRAINT "variation_orders_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variation_orders" ADD CONSTRAINT "variation_orders_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variation_orders" ADD CONSTRAINT "variation_orders_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variation_order_lines" ADD CONSTRAINT "variation_order_lines_variationOrderId_fkey" FOREIGN KEY ("variationOrderId") REFERENCES "variation_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
