import { describe, expect, it } from 'vitest';
import { MilestoneStatus, ProjectStatus } from '@prisma/client';
import {
  toEngineerBudgetCategoryOptionDTO,
  toEngineerProjectCardDTO,
  toEngineerProjectDetailDTO,
  type ProjectAssignmentCardEntity,
} from '@/lib/engineer-workspace/mappers';

describe('Engineer Workspace Mappers (Unit Tests)', () => {
  describe('toEngineerProjectCardDTO', () => {
    it('correctly maps assignment entity, counts milestones and pending items, and strips sensitive data', () => {
      const assignment: ProjectAssignmentCardEntity = {
        assignedAt: new Date('2026-09-01T10:00:00.000Z'),
        project: {
          id: 'proj-1',
          code: 'PRJ-001',
          name: 'برج الأمل السكني',
          location: 'الرياض - حي الياسمين',
          status: ProjectStatus.ACTIVE,
          milestones: [
            { id: 'm-1', status: MilestoneStatus.COMPLETED },
            { id: 'm-2', status: MilestoneStatus.COMPLETED },
            { id: 'm-3', status: MilestoneStatus.IN_PROGRESS },
            { id: 'm-4', status: MilestoneStatus.PLANNED },
          ],
          expenses: [{ id: 'exp-1' }, { id: 'exp-2' }],
          custodies: [{ id: 'cust-1' }],
          progressReports: [{ reportDate: new Date('2026-09-25T00:00:00.000Z') }],
        },
      };

      const dto = toEngineerProjectCardDTO(assignment);

      expect(dto.id).toBe('proj-1');
      expect(dto.code).toBe('PRJ-001');
      expect(dto.name).toBe('برج الأمل السكني');
      expect(dto.location).toBe('الرياض - حي الياسمين');
      expect(dto.status).toBe(ProjectStatus.ACTIVE);
      expect(dto.assignedRole).toBe('مهندس موقع');
      expect(dto.assignedAt).toBe('2026-09-01T10:00:00.000Z');
      expect(dto.milestonesCount).toBe(4);
      expect(dto.completedMilestonesCount).toBe(2);
      expect(dto.pendingExpensesCount).toBe(2);
      expect(dto.pendingCustodiesCount).toBe(1);
      expect(dto.latestReportDate).toBe('2026-09-25');

      // Verify no sensitive keys exist
      expect('budget' in dto).toBe(false);
      expect('totalAmount' in dto).toBe(false);
      expect('spentAmount' in dto).toBe(false);
    });

    it('handles projects without location, reports, or milestones gracefully', () => {
      const assignment: ProjectAssignmentCardEntity = {
        assignedAt: new Date('2026-09-15T00:00:00.000Z'),
        project: {
          id: 'proj-2',
          code: 'PRJ-002',
          name: 'مشروع بلا موقع',
          location: null,
          status: ProjectStatus.PLANNED,
          milestones: [],
          expenses: [],
          custodies: [],
          progressReports: [],
        },
      };

      const dto = toEngineerProjectCardDTO(assignment);

      expect(dto.location).toBeNull();
      expect(dto.milestonesCount).toBe(0);
      expect(dto.completedMilestonesCount).toBe(0);
      expect(dto.pendingExpensesCount).toBe(0);
      expect(dto.pendingCustodiesCount).toBe(0);
      expect(dto.latestReportDate).toBeNull();
    });
  });

  describe('toEngineerBudgetCategoryOptionDTO', () => {
    it('strictly outputs id, category, and description with NO monetary amounts or ceilings', () => {
      const rawLine = {
        id: 'bl-100',
        category: 'MATERIALS',
        description: 'مواد بناء وتشطيب',
        amount: '500000.00', // hypothetical raw input from query
      };

      const dto = toEngineerBudgetCategoryOptionDTO(rawLine);

      expect(dto.id).toBe('bl-100');
      expect(dto.category).toBe('MATERIALS');
      expect(dto.description).toBe('مواد بناء وتشطيب');

      // BD-14-11: Verify amount/ceiling is completely absent
      expect('amount' in dto).toBe(false);
      expect('ceiling' in dto).toBe(false);
      expect('spent' in dto).toBe(false);
    });
  });

  describe('toEngineerProjectDetailDTO', () => {
    it('formats dates properly and assigns default role', () => {
      const rawProject = {
        id: 'proj-10',
        code: 'PRJ-010',
        name: 'مبنى إداري',
        description: 'مبنى مكاتب مكون من 5 طوابق',
        location: 'جدة',
        status: ProjectStatus.ACTIVE,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      };

      const rawAssignment = {
        assignedAt: new Date('2026-02-01T08:00:00.000Z'),
      };

      const dto = toEngineerProjectDetailDTO(rawProject, rawAssignment);

      expect(dto.id).toBe('proj-10');
      expect(dto.code).toBe('PRJ-010');
      expect(dto.name).toBe('مبنى إداري');
      expect(dto.description).toBe('مبنى مكاتب مكون من 5 طوابق');
      expect(dto.location).toBe('جدة');
      expect(dto.status).toBe(ProjectStatus.ACTIVE);
      expect(dto.startDate).toBe('2026-01-01');
      expect(dto.endDate).toBe('2026-12-31');
      expect(dto.assignedRole).toBe('مهندس موقع');
      expect(dto.assignedAt).toBe('2026-02-01T08:00:00.000Z');
    });
  });
});
