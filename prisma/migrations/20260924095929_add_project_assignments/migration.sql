-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "project_assignments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "engineerId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT NOT NULL,
    "removedAt" TIMESTAMPTZ,
    "removedById" TEXT,
    "removalReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "project_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_assignments_projectId_status_idx" ON "project_assignments"("projectId", "status");

-- CreateIndex
CREATE INDEX "project_assignments_engineerId_status_idx" ON "project_assignments"("engineerId", "status");

-- CreateIndex
CREATE INDEX "project_assignments_status_idx" ON "project_assignments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "project_assignments_projectId_engineerId_key" ON "project_assignments"("projectId", "engineerId");

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_engineerId_fkey" FOREIGN KEY ("engineerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
