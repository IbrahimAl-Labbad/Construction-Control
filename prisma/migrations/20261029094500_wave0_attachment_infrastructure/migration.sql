-- CreateEnum
CREATE TYPE "AttachmentOwnerType" AS ENUM ('EXPENSE', 'PROGRESS_REPORT', 'SUBCONTRACTOR_BILLING', 'VARIATION_ORDER', 'CUSTODY_ADVANCE', 'MATERIAL_RECEIVING_NOTE');

-- CreateEnum
CREATE TYPE "AttachmentCategory" AS ENUM ('EXECUTION_EVIDENCE', 'PROGRESS_PHOTO', 'RECEIPT', 'DELIVERY_NOTE', 'INVOICE', 'SUPPORTING_DOCUMENT', 'AUDIT_EVIDENCE');

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerType" "AttachmentOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "category" "AttachmentCategory" NOT NULL DEFAULT 'SUPPORTING_DOCUMENT',
    "originalFileName" VARCHAR(255) NOT NULL,
    "storageKey" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" VARCHAR(64) NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "supersedesId" TEXT,
    "voidedAt" TIMESTAMPTZ,
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attachments_sizeBytes_bounds_check" CHECK ("sizeBytes" >= 1 AND "sizeBytes" <= 10485760),
    CONSTRAINT "attachments_mimeType_allowlist_check" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
    CONSTRAINT "attachments_checksumSha256_format_check" CHECK ("checksumSha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "attachments_no_self_supersede_check" CHECK ("supersedesId" IS NULL OR "supersedesId" <> "id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_supersedesId_key" ON "attachments"("supersedesId");

-- CreateIndex
CREATE INDEX "attachments_projectId_ownerType_ownerId_idx" ON "attachments"("projectId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "attachments_ownerType_ownerId_voidedAt_idx" ON "attachments"("ownerType", "ownerId", "voidedAt");

-- CreateIndex
CREATE INDEX "attachments_projectId_createdAt_idx" ON "attachments"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "attachments_uploadedById_idx" ON "attachments"("uploadedById");

-- CreateIndex
CREATE INDEX "attachments_voidedAt_idx" ON "attachments"("voidedAt");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

