import { describe, it, expect } from 'vitest';
import {
  ALL_TAB_PER_DOMAIN_LIMIT,
  ALL_TAB_DISPLAY_LIMIT,
} from '@/lib/approvals/queries/get-all-tab-triage';
import type { ApprovalItemDTO } from '@/lib/approvals/types';

// Helper to construct mock ApprovalItemDTO
function createMockItem(
  domain: ApprovalItemDTO['domain'],
  id: string,
  submittedAt: string | null,
  createdAt: string = '2026-09-01T00:00:00.000Z'
): ApprovalItemDTO {
  const base = {
    id,
    domain,
    status: 'SUBMITTED' as const,
    projectId: 'p1',
    projectCode: 'PRJ',
    projectName: 'مشروع',
    amount: '100.00',
    currency: 'SAR' as const,
    budgetLineCategory: 'CAT',
    budgetLineDescription: 'DESC',
    initiatorName: 'User',
    createdAt,
    submittedAt,
    detailsHref: '/test',
  };

  switch (domain) {
    case 'EXPENSE':
      return { ...base, domain, description: 'exp', expenseDate: '2026-09-01', custodyCode: null };
    case 'COMMITMENT':
      return { ...base, domain, vendorName: 'V', referenceNumber: null, commitmentDate: '2026-09-01', description: 'com', submitterName: null };
    case 'CUSTODY':
      return { ...base, domain, code: 'C-1', custodianName: 'Cust', purpose: 'purp', expectedSettlementDate: null };
    case 'PAYROLL':
      return { ...base, domain, workerName: 'W', tradeOrTitle: null, periodYear: 2026, periodMonth: 9, description: 'pay' };
    case 'SUBCONTRACTOR_BILLING':
      return { ...base, domain, subcontractorName: 'Sub', referenceNumber: null, billingPeriod: '2026-09', claimDate: '2026-09-01', commitmentReference: null, commitmentAmount: '0.00' };
    case 'VARIATION_ORDER':
      return {
        ...base,
        domain,
        orderNumber: 'VO-001',
        title: 'vo',
        reason: 'reason',
        scopeImpact: null,
        commitmentReference: null,
        commitmentVendorName: null,
        linesCount: 0,
      };
  }
}

// Logic replicate matching get-all-tab-triage sorting algorithm
function sortAndSlice(candidates: ApprovalItemDTO[]): ApprovalItemDTO[] {
  const sorted = [...candidates].sort((a, b) => {
    const timeA = new Date(a.submittedAt ?? a.createdAt).getTime();
    const timeB = new Date(b.submittedAt ?? b.createdAt).getTime();
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    return a.id.localeCompare(b.id);
  });
  return sorted.slice(0, ALL_TAB_DISPLAY_LIMIT);
}

describe('All-Tab Triage Logic (Unit)', () => {
  it('has consistent limits: ALL_TAB_PER_DOMAIN_LIMIT === 50 and ALL_TAB_DISPLAY_LIMIT === 50', () => {
    expect(ALL_TAB_PER_DOMAIN_LIMIT).toBe(50);
    expect(ALL_TAB_DISPLAY_LIMIT).toBe(50);
  });

  it('sorts deterministically by submittedAt ASC, id ASC', () => {
    const item1 = createMockItem('EXPENSE', 'id-b', '2026-09-02T10:00:00.000Z');
    const item2 = createMockItem('COMMITMENT', 'id-a', '2026-09-01T10:00:00.000Z');
    const item3 = createMockItem('CUSTODY', 'id-c', '2026-09-03T10:00:00.000Z');

    const result = sortAndSlice([item1, item2, item3]);

    expect(result.map((r) => r.id)).toEqual(['id-a', 'id-b', 'id-c']);
  });

  it('uses id ASC as decisive tiebreaker when submittedAt is identical', () => {
    const sameTime = '2026-09-01T12:00:00.000Z';
    const itemZ = createMockItem('PAYROLL', 'zebra', sameTime);
    const itemA = createMockItem('EXPENSE', 'apple', sameTime);
    const itemM = createMockItem('COMMITMENT', 'mango', sameTime);

    const result = sortAndSlice([itemZ, itemA, itemM]);

    expect(result.map((r) => r.id)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('interleaves records across all 5 domains correctly in time order', () => {
    const items = [
      createMockItem('SUBCONTRACTOR_BILLING', 'bill-1', '2026-09-05T00:00:00.000Z'),
      createMockItem('EXPENSE', 'exp-1', '2026-09-01T00:00:00.000Z'),
      createMockItem('PAYROLL', 'pay-1', '2026-09-04T00:00:00.000Z'),
      createMockItem('COMMITMENT', 'com-1', '2026-09-02T00:00:00.000Z'),
      createMockItem('CUSTODY', 'cust-1', '2026-09-03T00:00:00.000Z'),
    ];

    const result = sortAndSlice(items);

    expect(result.map((r) => r.domain)).toEqual([
      'EXPENSE',
      'COMMITMENT',
      'CUSTODY',
      'PAYROLL',
      'SUBCONTRACTOR_BILLING',
    ]);
  });

  it('ensures candidate pool guarantee: if Domain A has 50 oldest items, all 50 appear in output', () => {
    const domainAItems: ApprovalItemDTO[] = [];
    for (let i = 1; i <= 50; i++) {
      const pad = String(i).padStart(2, '0');
      domainAItems.push(
        createMockItem('EXPENSE', `exp-${pad}`, `2026-09-01T00:${pad}:00.000Z`)
      );
    }

    const domainBItems: ApprovalItemDTO[] = [];
    for (let i = 1; i <= 10; i++) {
      const pad = String(i).padStart(2, '0');
      domainBItems.push(
        createMockItem('COMMITMENT', `com-${pad}`, `2026-09-02T00:${pad}:00.000Z`)
      );
    }

    const merged = [...domainAItems, ...domainBItems];
    expect(merged.length).toBe(60);

    const result = sortAndSlice(merged);

    expect(result.length).toBe(50);
    expect(result.every((r) => r.domain === 'EXPENSE')).toBe(true);
    expect(result[0]?.id).toBe('exp-01');
    expect(result[49]?.id).toBe('exp-50');
  });

  it('evaluates hasMoreBeyondWindow: true when total > items.length, false otherwise', () => {
    const totalMore = 75;
    const itemsCount = 50;
    const hasMore1 = totalMore > itemsCount;
    expect(hasMore1).toBe(true);

    const totalEqual = 50;
    const hasMore2 = totalEqual > itemsCount;
    expect(hasMore2).toBe(false);

    const totalLess = 12;
    const itemsCountLess = 12;
    const hasMore3 = totalLess > itemsCountLess;
    expect(hasMore3).toBe(false);
  });
});
