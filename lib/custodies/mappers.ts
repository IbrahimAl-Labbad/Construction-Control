/**
 * lib/custodies/mappers.ts
 *
 * Mappers to convert Prisma Custody records into client-safe DTOs.
 * Ensures all monetary amounts are formatted as strings (Decimal(15,2)).
 */

import type { BudgetCategory, CustodyStatus } from '@prisma/client';
import { ExpenseStatus, Prisma } from '@prisma/client';
import { calculateCustodyBalances } from './calculations';
import type {
  CustodyDetailDTO,
  CustodySummaryDTO,
  CustodyUserInfo,
} from './types';

type PrismaCustodyWithRelations = {
  id: string;
  code: string;
  projectId: string;
  project?: { id: string; name: string; code: string } | null;
  budgetLineId: string;
  budgetLine?: {
    id: string;
    category: BudgetCategory;
    description: string;
    amount: Prisma.Decimal;
  } | null;
  custodianUserId: string;
  custodian: { id: string; name: string; email: string };
  amount: Prisma.Decimal;
  currency: string;
  purpose: string;
  status: CustodyStatus;
  cashReturnedAmount: Prisma.Decimal;
  createdById: string;
  createdBy: { id: string; name: string; email: string };
  submittedById: string | null;
  submittedBy?: { id: string; name: string; email: string } | null;
  submittedAt: Date | null;
  approvedById: string | null;
  approvedBy?: { id: string; name: string; email: string } | null;
  approvedAt: Date | null;
  rejectedById: string | null;
  rejectedBy?: { id: string; name: string; email: string } | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  cancelledById: string | null;
  cancelledBy?: { id: string; name: string; email: string } | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  issuedById: string | null;
  issuedBy?: { id: string; name: string; email: string } | null;
  issuedAt: Date | null;
  settledAt: Date | null;
  closedById: string | null;
  closedBy?: { id: string; name: string; email: string } | null;
  closedAt: Date | null;
  expectedSettlementDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  expenses?: Array<{
    id: string;
    amount: Prisma.Decimal;
    status: ExpenseStatus;
    deletedAt?: Date | null;
    description?: string;
    expenseDate?: Date;
    submittedBy?: { id: string; name: string; email: string };
    approvedAt?: Date | null;
  }>;
  _count?: {
    expenses?: number;
  };
};

function mapUserInfo(user?: { id: string; name: string; email: string } | null): CustodyUserInfo | null {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

export function toCustodySummaryDTO(c: PrismaCustodyWithRelations): CustodySummaryDTO {
  // Aggregate expenses if present
  const nonDeletedExpenses = (c.expenses ?? []).filter((e) => !e.deletedAt);
  const settledSum = nonDeletedExpenses
    .filter((e) => e.status === ExpenseStatus.APPROVED)
    .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

  const pendingSum = nonDeletedExpenses
    .filter((e) => e.status === ExpenseStatus.SUBMITTED)
    .reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal('0.00'));

  const balances = calculateCustodyBalances({
    amount: c.amount,
    settledExpenses: settledSum,
    cashReturned: c.cashReturnedAmount,
    pendingExpenses: pendingSum,
  });

  return {
    id: c.id,
    code: c.code,
    projectId: c.projectId,
    project: c.project
      ? { id: c.project.id, name: c.project.name, code: c.project.code }
      : undefined,
    budgetLineId: c.budgetLineId,
    budgetLine: c.budgetLine
      ? {
          id: c.budgetLine.id,
          category: c.budgetLine.category,
          description: c.budgetLine.description,
          amount: c.budgetLine.amount.toFixed(2),
        }
      : undefined,
    custodianUserId: c.custodianUserId,
    custodian: mapUserInfo(c.custodian) ?? { id: c.custodianUserId, name: '', email: '' },
    amount: c.amount.toFixed(2),
    currency: c.currency,
    purpose: c.purpose,
    status: c.status,

    settledExpensesAmount: balances.settledExpenses.toFixed(2),
    cashReturnedAmount: balances.cashReturned.toFixed(2),
    remainingBalance: balances.remainingBalance.toFixed(2),
    availableToClaim: balances.availableToClaim.toFixed(2),

    createdById: c.createdById,
    createdBy: mapUserInfo(c.createdBy) ?? { id: c.createdById, name: '', email: '' },
    submittedById: c.submittedById,
    submittedBy: mapUserInfo(c.submittedBy),
    submittedAt: c.submittedAt,
    approvedById: c.approvedById,
    approvedBy: mapUserInfo(c.approvedBy),
    approvedAt: c.approvedAt,
    rejectedById: c.rejectedById,
    rejectedBy: mapUserInfo(c.rejectedBy),
    rejectedAt: c.rejectedAt,
    rejectionReason: c.rejectionReason,
    cancelledById: c.cancelledById,
    cancelledBy: mapUserInfo(c.cancelledBy),
    cancelledAt: c.cancelledAt,
    cancellationReason: c.cancellationReason,
    issuedById: c.issuedById,
    issuedBy: mapUserInfo(c.issuedBy),
    issuedAt: c.issuedAt,
    settledAt: c.settledAt,
    closedById: c.closedById,
    closedBy: mapUserInfo(c.closedBy),
    closedAt: c.closedAt,
    expectedSettlementDate: c.expectedSettlementDate,
    expensesCount: c._count?.expenses ?? nonDeletedExpenses.length,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function toCustodyDetailDTO(c: PrismaCustodyWithRelations): CustodyDetailDTO {
  const summary = toCustodySummaryDTO(c);
  const expenses = (c.expenses ?? [])
    .filter((e) => !e.deletedAt)
    .map((e) => ({
      id: e.id,
      amount: e.amount.toFixed(2),
      description: e.description ?? '',
      expenseDate: e.expenseDate ?? new Date(),
      status: e.status,
      submittedBy: mapUserInfo(e.submittedBy) ?? { id: '', name: '', email: '' },
      approvedAt: e.approvedAt ?? null,
    }));

  return {
    ...summary,
    expenses,
  };
}
