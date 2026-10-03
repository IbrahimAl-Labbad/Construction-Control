/**
 * lib/approvals/queries/get-all-tab-triage.ts
 *
 * All-tab bounded triage view for the Approvals Hub.
 * Fetches up to ALL_TAB_PER_DOMAIN_LIMIT (50) records per domain in parallel,
 * merges, sorts globally by (submittedAt ?? createdAt) ASC, id ASC,
 * and slices to ALL_TAB_DISPLAY_LIMIT (50).
 *
 * Guarantees that the globally oldest 50 records are present in the output.
 *
 * Authorized exclusively for Role.MANAGER.
 */

import { prisma } from '@/lib/db/prisma';
import { requireManager } from '@/lib/permissions';
import { getPendingCounts } from './get-pending-counts';
import { PENDING_EXPENSES_SELECT } from './get-pending-expenses';
import { PENDING_COMMITMENTS_SELECT } from './get-pending-commitments';
import { PENDING_CUSTODIES_SELECT } from './get-pending-custodies';
import { PENDING_PAYROLL_SELECT } from './get-pending-payroll';
import { PENDING_BILLINGS_SELECT } from './get-pending-billings';
import { PENDING_VARIATIONS_SELECT } from './get-pending-variations';
import {
  toExpenseApprovalItemDTO,
  toCommitmentApprovalItemDTO,
  toCustodyApprovalItemDTO,
  toPayrollApprovalItemDTO,
  toBillingApprovalItemDTO,
  toVariationOrderApprovalItemDTO,
} from '../mappers';
import type { AllTabFeedDTO, ApprovalItemDTO } from '../types';

export const ALL_TAB_PER_DOMAIN_LIMIT = 50;
export const ALL_TAB_DISPLAY_LIMIT = 50;

export async function getAllTabTriage(): Promise<AllTabFeedDTO> {
  await requireManager();

  const where = {
    status: 'SUBMITTED' as const,
    deletedAt: null,
  };

  const orderBy = [{ submittedAt: 'asc' as const }, { id: 'asc' as const }];

  const [
    rawExpenses,
    rawCommitments,
    rawCustodies,
    rawPayroll,
    rawBillings,
    rawVariations,
    counts,
  ] = await Promise.all([
    prisma.expense.findMany({
      where,
      select: PENDING_EXPENSES_SELECT,
      orderBy,
      take: ALL_TAB_PER_DOMAIN_LIMIT,
    }),
    prisma.commitment.findMany({
      where,
      select: PENDING_COMMITMENTS_SELECT,
      orderBy,
      take: ALL_TAB_PER_DOMAIN_LIMIT,
    }),
    prisma.custody.findMany({
      where,
      select: PENDING_CUSTODIES_SELECT,
      orderBy,
      take: ALL_TAB_PER_DOMAIN_LIMIT,
    }),
    prisma.payrollEntry.findMany({
      where,
      select: PENDING_PAYROLL_SELECT,
      orderBy,
      take: ALL_TAB_PER_DOMAIN_LIMIT,
    }),
    prisma.subcontractorBilling.findMany({
      where,
      select: PENDING_BILLINGS_SELECT,
      orderBy,
      take: ALL_TAB_PER_DOMAIN_LIMIT,
    }),
    prisma.variationOrder.findMany({
      where,
      select: PENDING_VARIATIONS_SELECT,
      orderBy,
      take: ALL_TAB_PER_DOMAIN_LIMIT,
    }),
    getPendingCounts(),
  ]);

  const candidates: ApprovalItemDTO[] = [
    ...rawExpenses.map(toExpenseApprovalItemDTO),
    ...rawCommitments.map(toCommitmentApprovalItemDTO),
    ...rawCustodies.map(toCustodyApprovalItemDTO),
    ...rawPayroll.map(toPayrollApprovalItemDTO),
    ...rawBillings.map(toBillingApprovalItemDTO),
    ...rawVariations.map(toVariationOrderApprovalItemDTO),
  ];

  candidates.sort((a, b) => {
    const timeA = new Date(a.submittedAt ?? a.createdAt).getTime();
    const timeB = new Date(b.submittedAt ?? b.createdAt).getTime();
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    return a.id.localeCompare(b.id);
  });

  const items = candidates.slice(0, ALL_TAB_DISPLAY_LIMIT);

  return {
    activeTab: 'all',
    items,
    counts,
    hasMoreBeyondWindow: counts.total > items.length,
  };
}
