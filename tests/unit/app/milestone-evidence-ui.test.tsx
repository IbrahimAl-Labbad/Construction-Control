/**
 * tests/unit/app/milestone-evidence-ui.test.tsx
 *
 * CR-08 / BD-17 Visual Progress & Milestone Evidence-Gated Completion.
 * Task 4: Arabic UI Integration & Remediation Unit Tests.
 *
 * Covers:
 * 1. MilestoneEvidenceBadge:
 *    - State A: Sufficient evidence (green, approved reports with photos)
 *    - State B: Genuinely pending unapproved reports (amber)
 *    - State C: Approved reports exist but missing qualified photos (amber)
 *    - State D: No reports linked / no evidence (red/slate)
 *    - Distinction: All-rejected/cancelled reports render State D, NOT State B
 *    - Accurate description for mixed states (pending + rejected)
 *    - Size variations ('sm' and 'md')
 * 2. CompleteMilestoneDialog:
 *    - Dialog opens on trigger click
 *    - Explanatory alert rendered when criteria unmet
 *    - Explanatory alert distinguishes all-rejected from pending reports
 *    - Confirm completion button is disabled when evidence is insufficient
 *    - Confirm completion button is enabled when evidence is sufficient
 *    - Display of linked reports and photo previews
 * 3. LinkedMilestonesCard:
 *    - Empty state rendered when no milestones linked
 *    - Milestone list rendered with titles, order index, target date, and status badges
 * 4. ProgressReportForm:
 *    - Renders milestone selection section with Arabic heading and mandatory callout note
 *    - Toggles milestone checkboxes and updates selected count
 *    - Existing completed milestone links remain selected and disabled (immutable)
 *    - Existing cancelled milestone links remain selected and disabled (immutable)
 *    - Edit with unchanged empty milestone selection omits linkage input (_hasMilestoneInput)
 *    - Edit with unchanged non-empty selection omits linkage input
 *    - Edit with changed selection submits _hasMilestoneInput and complete resulting ID array
 *    - Removing all permitted links submits _hasMilestoneInput with empty milestoneIds array
 *    - Unrelated field edits preserve Task 3 fast path
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import { MilestoneEvidenceBadge } from '@/app/(manager)/projects/[projectId]/milestones/components/milestone-evidence-badge';
import { CompleteMilestoneDialog } from '@/app/(manager)/projects/[projectId]/milestones/components/complete-milestone-dialog';
import { LinkedMilestonesCard } from '@/components/progress-reports/linked-milestones-card';
import { ProgressReportForm } from '@/components/progress-reports/progress-report-form';
import type { ProjectMilestoneDTO } from '@/lib/milestones';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  usePathname: () => '/projects/prj_1/milestones',
}));

const mockGetMilestoneEvidenceAction = vi.fn();
const mockCompleteMilestoneAction = vi.fn();

vi.mock('@/app/(manager)/projects/[projectId]/milestones/actions', () => ({
  getMilestoneEvidenceAction: (...args: unknown[]) => mockGetMilestoneEvidenceAction(...args),
  completeMilestoneAction: (...args: unknown[]) => mockCompleteMilestoneAction(...args),
}));

// Mock HTMLDialogElement methods for JSDOM
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
});

// ---------------------------------------------------------------------------
// 1. MilestoneEvidenceBadge Tests
// ---------------------------------------------------------------------------

describe('MilestoneEvidenceBadge', () => {
  it('renders State A: Sufficient evidence (green) when hasSufficientEvidence is true', () => {
    render(
      <MilestoneEvidenceBadge
        milestone={{
          hasSufficientEvidence: true,
          linkedReportsCount: 2,
          approvedReportsCount: 2,
          visualAttachmentsCount: 5,
          pendingReportsCount: 0,
          rejectedReportsCount: 0,
        }}
      />,
    );

    const badge = screen.getByTestId('evidence-badge-sufficient');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('أدلة بصرية معتمدة (5 صور مؤهلة)');
    expect(badge.className).toContain('text-emerald-700');
  });

  it('renders State B: Pending unapproved reports (amber) with accurate tooltip covering DRAFT and SUBMITTED', () => {
    render(
      <MilestoneEvidenceBadge
        milestone={{
          hasSufficientEvidence: false,
          linkedReportsCount: 2,
          approvedReportsCount: 0,
          visualAttachmentsCount: 0,
          pendingReportsCount: 2,
          rejectedReportsCount: 0,
        }}
      />,
    );

    const badge = screen.getByTestId('evidence-badge-pending');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('بانتظار اعتماد تقارير التقدم');
    expect(badge.className).toContain('text-amber-700');
    expect(badge.getAttribute('title')).toContain('يوجد 2 تقرير مرتبط قيد الإعداد أو بانتظار الاعتماد');
  });

  it('renders State C: Approved reports exist but zero qualified photos (amber)', () => {
    render(
      <MilestoneEvidenceBadge
        milestone={{
          hasSufficientEvidence: false,
          linkedReportsCount: 1,
          approvedReportsCount: 1,
          visualAttachmentsCount: 0,
          pendingReportsCount: 0,
          rejectedReportsCount: 0,
        }}
      />,
    );

    const badge = screen.getByTestId('evidence-badge-missing-photos');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('بانتظار صور مؤهلة');
    expect(badge.className).toContain('text-amber-700');
  });

  it('renders State D: No reports linked / no evidence (red/slate)', () => {
    render(
      <MilestoneEvidenceBadge
        milestone={{
          hasSufficientEvidence: false,
          linkedReportsCount: 0,
          approvedReportsCount: 0,
          visualAttachmentsCount: 0,
          pendingReportsCount: 0,
          rejectedReportsCount: 0,
        }}
      />,
    );

    const badge = screen.getByTestId('evidence-badge-none');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('لا توجد أدلة بصرية معتمدة');
  });

  it('distinguishes all-rejected reports from pending reports (renders State D, not State B)', () => {
    render(
      <MilestoneEvidenceBadge
        milestone={{
          hasSufficientEvidence: false,
          linkedReportsCount: 2,
          approvedReportsCount: 0,
          visualAttachmentsCount: 0,
          pendingReportsCount: 0,
          rejectedReportsCount: 2,
        }}
      />,
    );

    // Must NOT render pending badge
    expect(screen.queryByTestId('evidence-badge-pending')).toBeNull();

    // Must render State D (None) with accurate explanatory tooltip
    const badge = screen.getByTestId('evidence-badge-none');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('لا توجد أدلة بصرية معتمدة');
    expect(badge.getAttribute('title')).toContain('جميع تقارير التقدم المرتبطة (2) مرفوضة أو ملغاة');
  });

  it('accurately describes mixed pending and rejected reports', () => {
    render(
      <MilestoneEvidenceBadge
        milestone={{
          hasSufficientEvidence: false,
          linkedReportsCount: 2,
          approvedReportsCount: 0,
          visualAttachmentsCount: 0,
          pendingReportsCount: 1,
          rejectedReportsCount: 1,
        }}
      />,
    );

    const badge = screen.getByTestId('evidence-badge-pending');
    expect(badge).toBeDefined();
    expect(badge.getAttribute('title')).toContain('يوجد 1 تقرير مرتبط قيد الإعداد أو بانتظار الاعتماد (1 تقرير مرفوض أو ملغى)');
  });

  it('accurately displays tooltip for DRAFT and SUBMITTED reports without falsely asserting manager triage', () => {
    render(
      <MilestoneEvidenceBadge
        milestone={{
          hasSufficientEvidence: false,
          linkedReportsCount: 3,
          approvedReportsCount: 0,
          visualAttachmentsCount: 0,
          pendingReportsCount: 3,
          rejectedReportsCount: 0,
        }}
      />,
    );

    const badge = screen.getByTestId('evidence-badge-pending');
    expect(badge).toBeDefined();
    // Confirms neutral wording covering both DRAFT (in preparation) and SUBMITTED (awaiting approval)
    expect(badge.getAttribute('title')).toBe('يوجد 3 تقرير مرتبط قيد الإعداد أو بانتظار الاعتماد');
    expect(badge.getAttribute('title')).not.toContain('بانتظار مراجعة واعتماد المدير');
  });

  it('supports size="md" variant', () => {
    render(
      <MilestoneEvidenceBadge
        size="md"
        milestone={{
          hasSufficientEvidence: true,
          linkedReportsCount: 1,
          approvedReportsCount: 1,
          visualAttachmentsCount: 3,
          pendingReportsCount: 0,
          rejectedReportsCount: 0,
        }}
      />,
    );

    const badge = screen.getByTestId('evidence-badge-sufficient');
    expect(badge.className).toContain('text-xs');
  });
});

// ---------------------------------------------------------------------------
// 2. CompleteMilestoneDialog Tests
// ---------------------------------------------------------------------------

describe('CompleteMilestoneDialog', () => {
  const milestoneWithoutEvidence: ProjectMilestoneDTO = {
    id: 'ms_1',
    projectId: 'prj_1',
    title: 'صب خرسانة الدور الأرضي',
    description: 'الأعمال الإنشائية',
    orderIndex: 0,
    status: 'IN_PROGRESS',
    targetDate: '2026-12-01',
    achievedAt: null,
    isOverdue: false,
    createdById: 'usr_1',
    creatorName: 'م. أحمد',
    updatedById: 'usr_1',
    updaterName: 'م. أحمد',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    linkedReportsCount: 1,
    approvedReportsCount: 0,
    visualAttachmentsCount: 0,
    hasSufficientEvidence: false,
    pendingReportsCount: 1,
    rejectedReportsCount: 0,
  };

  const milestoneWithEvidence: ProjectMilestoneDTO = {
    ...milestoneWithoutEvidence,
    id: 'ms_2',
    linkedReportsCount: 2,
    approvedReportsCount: 2,
    visualAttachmentsCount: 4,
    hasSufficientEvidence: true,
    pendingReportsCount: 0,
    rejectedReportsCount: 0,
  };

  it('opens dialog when trigger button is clicked and disables complete button if evidence is insufficient', async () => {
    mockGetMilestoneEvidenceAction.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'rep_1',
          title: 'تقرير الموقع الأسبوعي',
          reportDate: '2026-11-01',
          status: 'SUBMITTED',
          authorName: 'م. أحمد',
          attachments: [],
        },
      ],
    });

    render(
      <CompleteMilestoneDialog
        projectId="prj_1"
        milestone={milestoneWithoutEvidence}
      />,
    );

    const triggerBtn = screen.getByTestId('complete-milestone-ms_1');
    await act(async () => {
      fireEvent.click(triggerBtn);
    });

    expect(screen.getByText('إكمال المحطة التخطيطية')).toBeDefined();
    expect(screen.getByTestId('evidence-insufficient-alert')).toBeDefined();
    expect(screen.getByText(/معايير الإكمال غير مستوفاة/)).toBeDefined();

    const confirmBtn = screen.getByTestId('confirm-complete-button');
    expect(confirmBtn.hasAttribute('disabled')).toBe(true);

    await waitFor(() => {
      expect(screen.getByText('تقرير الموقع الأسبوعي')).toBeDefined();
    });
  });

  it('renders explanatory alert distinguishing all-rejected reports from pending ones', async () => {
    const allRejectedMilestone: ProjectMilestoneDTO = {
      ...milestoneWithoutEvidence,
      id: 'ms_all_rej',
      linkedReportsCount: 1,
      approvedReportsCount: 0,
      visualAttachmentsCount: 0,
      hasSufficientEvidence: false,
      pendingReportsCount: 0,
      rejectedReportsCount: 1,
    };

    mockGetMilestoneEvidenceAction.mockResolvedValue({
      success: true,
      data: [],
    });

    render(
      <CompleteMilestoneDialog
        projectId="prj_1"
        milestone={allRejectedMilestone}
      />,
    );

    const triggerBtn = screen.getByTestId('complete-milestone-ms_all_rej');
    await act(async () => {
      fireEvent.click(triggerBtn);
    });

    const alert = screen.getByTestId('evidence-insufficient-alert');
    expect(alert.textContent).toContain('جميع تقارير التقدم المرتبطة بهذه المحطة مرفوضة أو ملغاة');
  });

  it('enables complete button when evidence is sufficient and calls completeMilestoneAction on click', async () => {
    mockGetMilestoneEvidenceAction.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'rep_2',
          title: 'تقرير الصب النهائي',
          reportDate: '2026-11-01',
          status: 'APPROVED',
          authorName: 'م. خالد',
          attachments: [
            {
              id: 'att_1',
              originalFileName: 'foundation_photo_1.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 1024 * 500,
              category: 'SITE_PHOTO',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
    });

    mockCompleteMilestoneAction.mockResolvedValue({
      success: true,
      data: { ...milestoneWithEvidence, status: 'COMPLETED' },
    });

    render(
      <CompleteMilestoneDialog
        projectId="prj_1"
        milestone={milestoneWithEvidence}
      />,
    );

    const triggerBtn = screen.getByTestId('complete-milestone-ms_2');
    await act(async () => {
      fireEvent.click(triggerBtn);
    });

    expect(screen.getByTestId('evidence-sufficient-alert')).toBeDefined();
    expect(screen.getByText(/مستوفٍ لمعايير الأدلة البصرية/)).toBeDefined();

    const confirmBtn = screen.getByTestId('confirm-complete-button');
    expect(confirmBtn.hasAttribute('disabled')).toBe(false);

    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(mockCompleteMilestoneAction).toHaveBeenCalledWith('prj_1', 'ms_2');
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// 3. LinkedMilestonesCard Tests
// ---------------------------------------------------------------------------

describe('LinkedMilestonesCard', () => {
  it('renders empty state when no milestones are linked', () => {
    render(<LinkedMilestonesCard milestones={[]} />);

    expect(
      screen.getByText('لم يتم ربط هذا التقرير بأي محطات تخطيطية للمشروع.'),
    ).toBeDefined();
  });

  it('renders linked milestones list with order index, title, target date, and status', () => {
    const linkedMilestones = [
      {
        id: 'ms_1',
        title: 'أعمال الأساسات',
        orderIndex: 0,
        targetDate: '2026-12-15',
        status: 'IN_PROGRESS',
      },
      {
        id: 'ms_2',
        title: 'أعمال العظم',
        orderIndex: 1,
        targetDate: '2026-12-30',
        status: 'PLANNED',
      },
    ];

    render(<LinkedMilestonesCard milestones={linkedMilestones} />);

    expect(screen.getByTestId('linked-milestones-card')).toBeDefined();
    expect(screen.getByTestId('linked-milestones-count').textContent).toContain('2 محطات');

    expect(screen.getByTestId('linked-milestone-item-ms_1')).toBeDefined();
    expect(screen.getByText('أعمال الأساسات')).toBeDefined();
    expect(screen.getByText('#1')).toBeDefined();
    expect(screen.getByText('2026-12-15')).toBeDefined();

    expect(screen.getByTestId('linked-milestone-item-ms_2')).toBeDefined();
    expect(screen.getByText('أعمال العظم')).toBeDefined();
    expect(screen.getByText('#2')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. ProgressReportForm Tests
// ---------------------------------------------------------------------------

describe('ProgressReportForm', () => {
  const dummyProjects = [
    { id: 'prj_1', code: 'PRJ-01', name: 'مشروع برج الرياض' },
    { id: 'prj_2', code: 'PRJ-02', name: 'مشروع مجمع جدة' },
  ];

  const dummyMilestonesByProject = {
    prj_1: [
      { id: 'ms_1', title: 'حفر الموقع', orderIndex: 0, status: 'IN_PROGRESS' },
      { id: 'ms_2', title: 'صب القواعد', orderIndex: 1, status: 'PLANNED' },
    ],
    prj_2: [
      { id: 'ms_3', title: 'أعمال الكهرباء', orderIndex: 0, status: 'PLANNED' },
    ],
  };

  it('renders milestone tagging section with mandatory callout note', () => {
    render(
      <ProgressReportForm
        projects={dummyProjects}
        milestonesByProject={dummyMilestonesByProject}
        onSubmit={vi.fn().mockResolvedValue({ success: true })}
        isEdit={false}
      />,
    );

    expect(screen.getByTestId('milestones-selection-section')).toBeDefined();
    expect(screen.getByText('المحطات التخطيطية المستهدفة بالتقرير')).toBeDefined();
    expect(
      screen.getByText(
        'الصور المرفقة بالتقرير تؤهل المحطات المرتبطة للاعتماد فقط بعد مراجعة التقرير واعتماده من قبل المدير.',
      ),
    ).toBeDefined();
    expect(screen.getByText('حفر الموقع')).toBeDefined();
    expect(screen.getByText('صب القواعد')).toBeDefined();
  });

  it('toggles milestone checkboxes and updates selected count', () => {
    render(
      <ProgressReportForm
        projects={dummyProjects}
        milestonesByProject={dummyMilestonesByProject}
        onSubmit={vi.fn().mockResolvedValue({ success: true })}
        isEdit={false}
      />,
    );

    const countBadge = screen.getByTestId('selected-milestones-count');
    expect(countBadge.textContent).toContain('0 محطات محددة');

    const checkbox1 = screen.getByTestId('milestone-checkbox-ms_1') as HTMLInputElement;
    expect(checkbox1.checked).toBe(false);

    fireEvent.click(checkbox1);
    expect(checkbox1.checked).toBe(true);
    expect(countBadge.textContent).toContain('1 محطات محددة');

    fireEvent.click(checkbox1);
    expect(checkbox1.checked).toBe(false);
    expect(countBadge.textContent).toContain('0 محطات محددة');
  });

  it('disables checkbox for completed milestone previously linked to report', () => {
    const editMilestones = [
      { id: 'ms_completed', title: 'محطة مكتملة سابقة', orderIndex: 0, status: 'COMPLETED' },
      { id: 'ms_active', title: 'محطة جارية', orderIndex: 1, status: 'IN_PROGRESS' },
    ];

    render(
      <ProgressReportForm
        isEdit={true}
        availableMilestones={editMilestones}
        initialData={{
          id: 'rep_edit_1',
          projectId: 'prj_1',
          project: { id: 'prj_1', code: 'PRJ-01', name: 'مشروع برج الرياض' },
          title: 'تقرير دوري',
          reportDate: '2026-11-01',
          progressPercentage: 40,
          workDescription: 'وصف تفصيلي يتجاوز عشرين حرفاً للأعمال المنجزة اليوم في الموقع.',
          blockers: null,
          nextPeriodPlan: null,
          weatherCondition: null,
          status: 'DRAFT',
          createdById: 'eng_1',
          createdBy: { id: 'eng_1', name: 'م. سالم' },
          submittedAt: null,
          approvedById: null,
          approvedBy: null,
          approvedAt: null,
          rejectedById: null,
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
          cancelledById: null,
          cancelledBy: null,
          cancelledAt: null,
          cancellationReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          milestones: [
            {
              id: 'ms_completed',
              title: 'محطة مكتملة سابقة',
              orderIndex: 0,
              targetDate: '2026-10-01',
              status: 'COMPLETED',
            },
          ],
        }}
        onSubmit={vi.fn().mockResolvedValue({ success: true })}
      />,
    );

    const completedCheckbox = screen.getByTestId('milestone-checkbox-ms_completed') as HTMLInputElement;
    expect(completedCheckbox.disabled).toBe(true);
    expect(completedCheckbox.checked).toBe(true);
    expect(screen.getByText('محطة مكتملة (ارتباط ثابت)')).toBeDefined();

    const activeCheckbox = screen.getByTestId('milestone-checkbox-ms_active') as HTMLInputElement;
    expect(activeCheckbox.disabled).toBe(false);
  });

  it('disables checkbox for cancelled milestone previously linked to report', () => {
    const editMilestones = [
      { id: 'ms_cancelled', title: 'محطة ملغاة سابقة', orderIndex: 0, status: 'CANCELLED' },
      { id: 'ms_active', title: 'محطة جارية', orderIndex: 1, status: 'IN_PROGRESS' },
    ];

    render(
      <ProgressReportForm
        isEdit={true}
        availableMilestones={editMilestones}
        initialData={{
          id: 'rep_edit_2',
          projectId: 'prj_1',
          project: { id: 'prj_1', code: 'PRJ-01', name: 'مشروع برج الرياض' },
          title: 'تقرير دوري',
          reportDate: '2026-11-01',
          progressPercentage: 40,
          workDescription: 'وصف تفصيلي يتجاوز عشرين حرفاً للأعمال المنجزة اليوم في الموقع.',
          blockers: null,
          nextPeriodPlan: null,
          weatherCondition: null,
          status: 'DRAFT',
          createdById: 'eng_1',
          createdBy: { id: 'eng_1', name: 'م. سالم' },
          submittedAt: null,
          approvedById: null,
          approvedBy: null,
          approvedAt: null,
          rejectedById: null,
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
          cancelledById: null,
          cancelledBy: null,
          cancelledAt: null,
          cancellationReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          milestones: [
            {
              id: 'ms_cancelled',
              title: 'محطة ملغاة سابقة',
              orderIndex: 0,
              targetDate: '2026-10-01',
              status: 'CANCELLED',
            },
          ],
        }}
        onSubmit={vi.fn().mockResolvedValue({ success: true })}
      />,
    );

    const cancelledCheckbox = screen.getByTestId('milestone-checkbox-ms_cancelled') as HTMLInputElement;
    expect(cancelledCheckbox.disabled).toBe(true);
    expect(cancelledCheckbox.checked).toBe(true);
    expect(screen.getByText('محطة ملغاة (ارتباط ثابت)')).toBeDefined();
  });

  it('edit with unchanged empty milestone selection omits linkage input (_hasMilestoneInput)', async () => {
    const mockSubmit = vi.fn().mockResolvedValue({ success: true, id: 'rep_edit_3' });

    render(
      <ProgressReportForm
        isEdit={true}
        availableMilestones={[{ id: 'ms_1', title: 'محطة 1', orderIndex: 0, status: 'IN_PROGRESS' }]}
        initialData={{
          id: 'rep_edit_3',
          projectId: 'prj_1',
          project: { id: 'prj_1', code: 'PRJ-01', name: 'مشروع برج الرياض' },
          title: 'تقرير دون محطات',
          reportDate: '2026-11-01',
          progressPercentage: 30,
          workDescription: 'وصف تفصيلي يتجاوز عشرين حرفاً للأعمال المنجزة اليوم في الموقع.',
          blockers: null,
          nextPeriodPlan: null,
          weatherCondition: null,
          status: 'DRAFT',
          createdById: 'eng_1',
          createdBy: { id: 'eng_1', name: 'م. سالم' },
          submittedAt: null,
          approvedById: null,
          approvedBy: null,
          approvedAt: null,
          rejectedById: null,
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
          cancelledById: null,
          cancelledBy: null,
          cancelledAt: null,
          cancellationReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          milestones: [],
        }}
        onSubmit={mockSubmit}
      />,
    );

    const submitBtn = screen.getByTestId('save-report-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const submittedFormData = mockSubmit.mock.calls[0]?.[0] as FormData;
    expect(submittedFormData).toBeDefined();
    expect(submittedFormData.has('_hasMilestoneInput')).toBe(false);
    expect(submittedFormData.has('milestoneIds')).toBe(false);
  });

  it('edit with unchanged non-empty selection omits linkage input', async () => {
    const mockSubmit = vi.fn().mockResolvedValue({ success: true, id: 'rep_edit_4' });

    render(
      <ProgressReportForm
        isEdit={true}
        availableMilestones={[
          { id: 'ms_1', title: 'محطة 1', orderIndex: 0, status: 'IN_PROGRESS' },
          { id: 'ms_2', title: 'محطة 2', orderIndex: 1, status: 'PLANNED' },
        ]}
        initialData={{
          id: 'rep_edit_4',
          projectId: 'prj_1',
          project: { id: 'prj_1', code: 'PRJ-01', name: 'مشروع برج الرياض' },
          title: 'تقرير مع محطة',
          reportDate: '2026-11-01',
          progressPercentage: 50,
          workDescription: 'وصف تفصيلي يتجاوز عشرين حرفاً للأعمال المنجزة اليوم في الموقع.',
          blockers: null,
          nextPeriodPlan: null,
          weatherCondition: null,
          status: 'DRAFT',
          createdById: 'eng_1',
          createdBy: { id: 'eng_1', name: 'م. سالم' },
          submittedAt: null,
          approvedById: null,
          approvedBy: null,
          approvedAt: null,
          rejectedById: null,
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
          cancelledById: null,
          cancelledBy: null,
          cancelledAt: null,
          cancellationReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          milestones: [
            { id: 'ms_1', title: 'محطة 1', orderIndex: 0, targetDate: '2026-12-01', status: 'IN_PROGRESS' },
          ],
        }}
        onSubmit={mockSubmit}
      />,
    );

    // Unrelated edit only (change work description)
    const workInput = screen.getByTestId('work-description-input');
    fireEvent.change(workInput, {
      target: { value: 'تحديث وصف الأعمال اليومية دون تغيير أي محطات مرتبطة.' },
    });

    const submitBtn = screen.getByTestId('save-report-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const submittedFormData = mockSubmit.mock.calls[0]?.[0] as FormData;
    expect(submittedFormData).toBeDefined();
    expect(submittedFormData.has('_hasMilestoneInput')).toBe(false);
    expect(submittedFormData.has('milestoneIds')).toBe(false);
  });

  it('edit with changed selection submits _hasMilestoneInput and complete resulting ID array', async () => {
    const mockSubmit = vi.fn().mockResolvedValue({ success: true, id: 'rep_edit_5' });

    render(
      <ProgressReportForm
        isEdit={true}
        availableMilestones={[
          { id: 'ms_1', title: 'محطة 1', orderIndex: 0, status: 'IN_PROGRESS' },
          { id: 'ms_2', title: 'محطة 2', orderIndex: 1, status: 'PLANNED' },
        ]}
        initialData={{
          id: 'rep_edit_5',
          projectId: 'prj_1',
          project: { id: 'prj_1', code: 'PRJ-01', name: 'مشروع برج الرياض' },
          title: 'تقرير قابل للتعديل',
          reportDate: '2026-11-01',
          progressPercentage: 50,
          workDescription: 'وصف تفصيلي يتجاوز عشرين حرفاً للأعمال المنجزة اليوم في الموقع.',
          blockers: null,
          nextPeriodPlan: null,
          weatherCondition: null,
          status: 'DRAFT',
          createdById: 'eng_1',
          createdBy: { id: 'eng_1', name: 'م. سالم' },
          submittedAt: null,
          approvedById: null,
          approvedBy: null,
          approvedAt: null,
          rejectedById: null,
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
          cancelledById: null,
          cancelledBy: null,
          cancelledAt: null,
          cancellationReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          milestones: [
            { id: 'ms_1', title: 'محطة 1', orderIndex: 0, targetDate: '2026-12-01', status: 'IN_PROGRESS' },
          ],
        }}
        onSubmit={mockSubmit}
      />,
    );

    // Toggle ms_2 on
    const cb2 = screen.getByTestId('milestone-checkbox-ms_2');
    fireEvent.click(cb2);

    const submitBtn = screen.getByTestId('save-report-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const submittedFormData = mockSubmit.mock.calls[0]?.[0] as FormData;
    expect(submittedFormData).toBeDefined();
    expect(submittedFormData.get('_hasMilestoneInput')).toBe('true');
    const submittedIds = submittedFormData.getAll('milestoneIds');
    expect(submittedIds).toContain('ms_1');
    expect(submittedIds).toContain('ms_2');
  });

  it('removing all permitted links submits _hasMilestoneInput with empty milestoneIds array', async () => {
    const mockSubmit = vi.fn().mockResolvedValue({ success: true, id: 'rep_edit_6' });

    render(
      <ProgressReportForm
        isEdit={true}
        availableMilestones={[
          { id: 'ms_1', title: 'محطة 1', orderIndex: 0, status: 'IN_PROGRESS' },
        ]}
        initialData={{
          id: 'rep_edit_6',
          projectId: 'prj_1',
          project: { id: 'prj_1', code: 'PRJ-01', name: 'مشروع برج الرياض' },
          title: 'تقرير سيتم فك ارتباطه',
          reportDate: '2026-11-01',
          progressPercentage: 50,
          workDescription: 'وصف تفصيلي يتجاوز عشرين حرفاً للأعمال المنجزة اليوم في الموقع.',
          blockers: null,
          nextPeriodPlan: null,
          weatherCondition: null,
          status: 'DRAFT',
          createdById: 'eng_1',
          createdBy: { id: 'eng_1', name: 'م. سالم' },
          submittedAt: null,
          approvedById: null,
          approvedBy: null,
          approvedAt: null,
          rejectedById: null,
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
          cancelledById: null,
          cancelledBy: null,
          cancelledAt: null,
          cancellationReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          milestones: [
            { id: 'ms_1', title: 'محطة 1', orderIndex: 0, targetDate: '2026-12-01', status: 'IN_PROGRESS' },
          ],
        }}
        onSubmit={mockSubmit}
      />,
    );

    // Uncheck ms_1
    const cb1 = screen.getByTestId('milestone-checkbox-ms_1');
    fireEvent.click(cb1);

    const submitBtn = screen.getByTestId('save-report-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const submittedFormData = mockSubmit.mock.calls[0]?.[0] as FormData;
    expect(submittedFormData).toBeDefined();
    expect(submittedFormData.get('_hasMilestoneInput')).toBe('true');
    const submittedIds = submittedFormData.getAll('milestoneIds');
    expect(submittedIds).toEqual([]);
  });
});
