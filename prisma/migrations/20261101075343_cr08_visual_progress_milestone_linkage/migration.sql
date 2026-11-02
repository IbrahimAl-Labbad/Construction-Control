/*
  Warnings:

  - A unique constraint covering the columns `[id,projectId]` on the table `progress_reports` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,projectId]` on the table `project_milestones` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "progress_report_milestones" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "linkedById" TEXT NOT NULL,
    "linkedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_report_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "progress_report_milestones_milestoneId_idx" ON "progress_report_milestones"("milestoneId");

-- CreateIndex
CREATE INDEX "progress_report_milestones_projectId_idx" ON "progress_report_milestones"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "progress_report_milestones_reportId_milestoneId_key" ON "progress_report_milestones"("reportId", "milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "progress_reports_id_projectId_key" ON "progress_reports"("id", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_milestones_id_projectId_key" ON "project_milestones"("id", "projectId");

-- AddForeignKey
ALTER TABLE "progress_report_milestones" ADD CONSTRAINT "progress_report_milestones_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_report_milestones" ADD CONSTRAINT "progress_report_milestones_reportId_projectId_fkey" FOREIGN KEY ("reportId", "projectId") REFERENCES "progress_reports"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_report_milestones" ADD CONSTRAINT "progress_report_milestones_milestoneId_projectId_fkey" FOREIGN KEY ("milestoneId", "projectId") REFERENCES "project_milestones"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_report_milestones" ADD CONSTRAINT "progress_report_milestones_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
