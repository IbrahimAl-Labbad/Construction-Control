'use client';

/**
 * app/(manager)/projects/[projectId]/team/components/team-member-table.tsx
 *
 * Interactive team members table displaying current active assignments and
 * the latest previous assignment state.
 * Vertical Slice 11 — Project Team & Engineer Assignment.
 *
 * Rules:
 * - Active members section: "أعضاء الفريق الحاليون".
 * - Inactive members section: "آخر حالة تعيين سابقة".
 * - Deactivated accounts displayed with explicit "حساب معطل" badge.
 * - Dates formatted in Arabic locale (ar-SA).
 */

import { useState } from 'react';
import { Users, UserX, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { RemoveEngineerDialog } from './remove-engineer-dialog';
import type { ProjectTeamMemberDTO } from '@/lib/project-team';

interface TeamMemberTableProps {
  projectId: string;
  teamMembers: ProjectTeamMemberDTO[];
  isProjectFrozen: boolean;
}

function formatDate(isoDateString: string | null): string {
  if (!isoDateString) return '—';
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoDateString));
}

export function TeamMemberTable({
  projectId,
  teamMembers,
  isProjectFrozen,
}: TeamMemberTableProps) {
  const [selectedRemoval, setSelectedRemoval] = useState<{
    assignmentId: string;
    engineerName: string;
  } | null>(null);

  const activeMembers = teamMembers.filter((m) => m.status === 'ACTIVE');
  const inactiveMembers = teamMembers.filter((m) => m.status === 'INACTIVE');

  return (
    <div className="space-y-8">
      {/* 1. Active Team Members Section */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                أعضاء الفريق الحاليون
              </h2>
              <p className="text-xs text-muted-foreground">
                المهندسون الميدانيون المعينون حالياً في المشروع ({activeMembers.length})
              </p>
            </div>
          </div>
        </div>

        {activeMembers.length === 0 ? (
          <div
            className="p-12 text-center"
            data-testid="no-active-engineers"
            role="status"
          >
            <p className="text-sm text-muted-foreground">
              لا يوجد مهندسون معينون حالياً في هذا المشروع.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground">
                <tr>
                  <th scope="col" className="px-6 py-3">اسم المهندس</th>
                  <th scope="col" className="px-6 py-3">البريد الإلكتروني</th>
                  <th scope="col" className="px-6 py-3">حالة الحساب</th>
                  <th scope="col" className="px-6 py-3">تاريخ التعيين</th>
                  <th scope="col" className="px-6 py-3">بواسطة</th>
                  {!isProjectFrozen && (
                    <th scope="col" className="px-6 py-3 text-center">الإجراءات</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeMembers.map((member) => (
                  <tr
                    key={member.assignmentId}
                    data-testid={`active-member-row-${member.engineerId}`}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-foreground">
                      {member.engineerName}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                      {member.engineerEmail}
                    </td>
                    <td className="px-6 py-4">
                      {member.engineerIsActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle className="size-3" aria-hidden="true" />
                          نشط
                        </span>
                      ) : (
                        <span
                          data-testid={`inactive-user-badge-${member.engineerId}`}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20"
                        >
                          <AlertTriangle className="size-3" aria-hidden="true" />
                          حساب معطل
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {formatDate(member.assignedAt)}
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {member.assignedByName}
                    </td>
                    {!isProjectFrozen && (
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedRemoval({
                              assignmentId: member.assignmentId,
                              engineerName: member.engineerName,
                            })
                          }
                          data-testid={`remove-engineer-button-${member.engineerId}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive shadow-sm hover:bg-destructive/20 transition-colors"
                        >
                          <UserX className="size-3.5" aria-hidden="true" />
                          <span>إلغاء التعيين</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. Latest Previous Assignment State Section */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Clock className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                آخر حالة تعيين سابقة
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                يعرض هذا الجدول آخر حالة تعيين سابقة للمهندسين في المشروع. السجل الزمني التراكمي الكامل لعمليات التعيين والإلغاء محفوظ وموثق في سجل التدقيق للنظام.
              </p>
            </div>
          </div>
        </div>

        {inactiveMembers.length === 0 ? (
          <div
            className="p-8 text-center text-xs text-muted-foreground"
            data-testid="no-inactive-engineers"
          >
            لا توجد حالات تعيين سابقة مسجلة لهذا المشروع.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground">
                <tr>
                  <th scope="col" className="px-6 py-3">اسم المهندس</th>
                  <th scope="col" className="px-6 py-3">البريد الإلكتروني</th>
                  <th scope="col" className="px-6 py-3">تاريخ التعيين</th>
                  <th scope="col" className="px-6 py-3">تاريخ الإلغاء</th>
                  <th scope="col" className="px-6 py-3">تم الإلغاء بواسطة</th>
                  <th scope="col" className="px-6 py-3">سبب الإلغاء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-muted-foreground">
                {inactiveMembers.map((member) => (
                  <tr
                    key={member.assignmentId}
                    data-testid={`inactive-member-row-${member.engineerId}`}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-foreground">
                      {member.engineerName}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">
                      {member.engineerEmail}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {formatDate(member.assignedAt)}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {formatDate(member.removedAt)}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {member.removedByName || '—'}
                    </td>
                    <td className="px-6 py-4 text-xs max-w-xs truncate" title={member.removalReason || ''}>
                      {member.removalReason || 'غير محدد'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Remove Confirmation Dialog */}
      {selectedRemoval && (
        <RemoveEngineerDialog
          projectId={projectId}
          assignmentId={selectedRemoval.assignmentId}
          engineerName={selectedRemoval.engineerName}
          isOpen={true}
          onClose={() => setSelectedRemoval(null)}
        />
      )}
    </div>
  );
}
