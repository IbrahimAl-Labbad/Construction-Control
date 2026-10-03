/**
 * lib/approvals/mappers.ts
 *
 * Pure transformation functions mapping Prisma query results to client-safe DTOs
 * for the Centralized Manager Approvals Hub.
 *
 * Ensures all monetary amounts are formatted 2-decimal strings and all dates
 * are ISO formatted strings to cross the server/client boundary safely.
 * Follows AGENTS.md §13 and §26.
 */

import type {
  ExpenseApprovalItemDTO,
  CommitmentApprovalItemDTO,
  CustodyApprovalItemDTO,
  PayrollApprovalItemDTO,
  BillingApprovalItemDTO,
  VariationOrderApprovalItemDTO,
} from './types';

// Helper for exact decimal string formatting
function formatAmount(amount: { toFixed: (digits: number) => string } | string): string {
  // Prisma Decimal fields always arrive as objects with `.toFixed()` — the primary path.
  // The `string` branch is defensive and exists for test-mock compatibility only.
  if (typeof amount === 'string') {
    return Number(amount).toFixed(2);
  }
  return amount.toFixed(2);
}

// Helpers for ISO timestamp string formatting (createdAt / submittedAt)
function formatRequiredIsoTimestamp(date: Date | string): string {
  if (typeof date === 'string') return date;
  return date.toISOString();
}

function formatOptionalIsoTimestamp(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  return formatRequiredIsoTimestamp(date);
}

// Helpers for date string formatting (YYYY-MM-DD)
function formatRequiredDateOnly(date: Date | string): string {
  if (typeof date === 'string') {
    const part = date.split('T')[0];
    return part ?? date;
  }
  const isoPart = date.toISOString().split('T')[0];
  return isoPart ?? date.toISOString();
}

function formatOptionalDateOnly(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  return formatRequiredDateOnly(date);
}

export type ExpenseQueryRow = {
  id: string;
  projectId: string;
  project: { code: string; name: string };
  budgetLine: { category: string; description: string };
  amount: { toFixed: (n: number) => string } | string;
  currency: string;
  description: string;
  expenseDate: Date | string;
  status: string;
  submittedBy: { name: string };
  submittedAt: Date | string | null;
  createdAt: Date | string;
  custody?: { code: string } | null;
};

export function toExpenseApprovalItemDTO(row: ExpenseQueryRow): ExpenseApprovalItemDTO {
  return {
    id: row.id,
    domain: 'EXPENSE',
    status: 'SUBMITTED',
    projectId: row.projectId,
    projectCode: row.project.code,
    projectName: row.project.name,
    amount: formatAmount(row.amount),
    currency: 'SAR',
    budgetLineCategory: row.budgetLine.category,
    budgetLineDescription: row.budgetLine.description,
    initiatorName: row.submittedBy.name,
    createdAt: formatRequiredIsoTimestamp(row.createdAt),
    submittedAt: formatOptionalIsoTimestamp(row.submittedAt),
    detailsHref: `/projects/${row.projectId}/expenses`,
    description: row.description,
    expenseDate: formatRequiredDateOnly(row.expenseDate),
    custodyCode: row.custody?.code ?? null,
  };
}

export type CommitmentQueryRow = {
  id: string;
  projectId: string;
  project: { code: string; name: string };
  budgetLine: { category: string; description: string };
  amount: { toFixed: (n: number) => string } | string;
  currency: string;
  vendorName: string;
  referenceNumber: string | null;
  commitmentDate: Date | string;
  description: string;
  status: string;
  createdBy: { name: string };
  submittedBy?: { name: string } | null;
  submittedAt: Date | string | null;
  createdAt: Date | string;
};

export function toCommitmentApprovalItemDTO(row: CommitmentQueryRow): CommitmentApprovalItemDTO {
  return {
    id: row.id,
    domain: 'COMMITMENT',
    status: 'SUBMITTED',
    projectId: row.projectId,
    projectCode: row.project.code,
    projectName: row.project.name,
    amount: formatAmount(row.amount),
    currency: 'SAR',
    budgetLineCategory: row.budgetLine.category,
    budgetLineDescription: row.budgetLine.description,
    initiatorName: row.createdBy.name,
    submitterName: row.submittedBy?.name ?? null,
    createdAt: formatRequiredIsoTimestamp(row.createdAt),
    submittedAt: formatOptionalIsoTimestamp(row.submittedAt),
    detailsHref: `/projects/${row.projectId}/commitments`,
    vendorName: row.vendorName,
    referenceNumber: row.referenceNumber ?? null,
    commitmentDate: formatRequiredDateOnly(row.commitmentDate),
    description: row.description,
  };
}

export type CustodyQueryRow = {
  id: string;
  code: string;
  projectId: string;
  project: { code: string; name: string };
  budgetLine: { category: string; description: string };
  amount: { toFixed: (n: number) => string } | string;
  currency: string;
  purpose: string;
  status: string;
  createdBy: { name: string };
  custodian: { name: string };
  expectedSettlementDate: Date | string | null;
  submittedAt: Date | string | null;
  createdAt: Date | string;
};

export function toCustodyApprovalItemDTO(row: CustodyQueryRow): CustodyApprovalItemDTO {
  return {
    id: row.id,
    domain: 'CUSTODY',
    status: 'SUBMITTED',
    projectId: row.projectId,
    projectCode: row.project.code,
    projectName: row.project.name,
    amount: formatAmount(row.amount),
    currency: 'SAR',
    budgetLineCategory: row.budgetLine.category,
    budgetLineDescription: row.budgetLine.description,
    initiatorName: row.createdBy.name,
    createdAt: formatRequiredIsoTimestamp(row.createdAt),
    submittedAt: formatOptionalIsoTimestamp(row.submittedAt),
    detailsHref: `/projects/${row.projectId}/custodies`,
    code: row.code,
    custodianName: row.custodian.name,
    purpose: row.purpose,
    expectedSettlementDate: formatOptionalDateOnly(row.expectedSettlementDate),
  };
}

export type PayrollQueryRow = {
  id: string;
  projectId: string;
  project: { code: string; name: string };
  budgetLine: { category: string; description: string };
  amount: { toFixed: (n: number) => string } | string;
  currency: string;
  workerName: string;
  tradeOrTitle: string | null;
  periodYear: number;
  periodMonth: number;
  description: string;
  status: string;
  createdBy: { name: string };
  submittedAt: Date | string | null;
  createdAt: Date | string;
};

export function toPayrollApprovalItemDTO(row: PayrollQueryRow): PayrollApprovalItemDTO {
  return {
    id: row.id,
    domain: 'PAYROLL',
    status: 'SUBMITTED',
    projectId: row.projectId,
    projectCode: row.project.code,
    projectName: row.project.name,
    amount: formatAmount(row.amount),
    currency: 'SAR',
    budgetLineCategory: row.budgetLine.category,
    budgetLineDescription: row.budgetLine.description,
    initiatorName: row.createdBy.name,
    createdAt: formatRequiredIsoTimestamp(row.createdAt),
    submittedAt: formatOptionalIsoTimestamp(row.submittedAt),
    detailsHref: `/payroll/${row.id}`,
    workerName: row.workerName,
    tradeOrTitle: row.tradeOrTitle ?? null,
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    description: row.description,
  };
}

export type BillingQueryRow = {
  id: string;
  projectId: string;
  project: { code: string; name: string };
  budgetLine: { category: string; description: string };
  grossAmount: { toFixed: (n: number) => string } | string;
  currency: string;
  subcontractorName: string;
  referenceNumber: string | null;
  billingPeriod: string;
  claimDate: Date | string;
  status: string;
  createdBy: { name: string };
  commitment?: { referenceNumber: string | null; amount: { toFixed: (n: number) => string } | string } | null;
  submittedAt: Date | string | null;
  createdAt: Date | string;
};

export function toBillingApprovalItemDTO(row: BillingQueryRow): BillingApprovalItemDTO {
  return {
    id: row.id,
    domain: 'SUBCONTRACTOR_BILLING',
    status: 'SUBMITTED',
    projectId: row.projectId,
    projectCode: row.project.code,
    projectName: row.project.name,
    amount: formatAmount(row.grossAmount),
    currency: 'SAR',
    budgetLineCategory: row.budgetLine.category,
    budgetLineDescription: row.budgetLine.description,
    initiatorName: row.createdBy.name,
    createdAt: formatRequiredIsoTimestamp(row.createdAt),
    submittedAt: formatOptionalIsoTimestamp(row.submittedAt),
    detailsHref: `/subcontractor-billings/${row.id}`,
    subcontractorName: row.subcontractorName,
    referenceNumber: row.referenceNumber ?? null,
    billingPeriod: row.billingPeriod,
    claimDate: formatRequiredDateOnly(row.claimDate),
    commitmentReference: row.commitment?.referenceNumber ?? null,
    commitmentAmount: row.commitment ? formatAmount(row.commitment.amount) : '0.00',
  };
}

export type VariationOrderApprovalsRow = {
  id: string;
  orderNumber: string;
  projectId: string;
  project: { code: string; name: string };
  budgetLine?: { category: string; description: string } | null;
  impactAmount: { toFixed: (n: number) => string } | string;
  currency: string;
  title: string;
  reason: string;
  scopeImpact: string | null;
  status: string;
  createdBy: { name: string };
  commitment?: { referenceNumber: string | null; vendorName: string } | null;
  _count?: { lines: number };
  lines?: unknown[];
  submittedAt: Date | string | null;
  createdAt: Date | string;
};

export function toVariationOrderApprovalItemDTO(
  row: VariationOrderApprovalsRow,
): VariationOrderApprovalItemDTO {
  const linesCount = row._count?.lines ?? row.lines?.length ?? 0;
  return {
    id: row.id,
    domain: 'VARIATION_ORDER',
    status: 'SUBMITTED',
    projectId: row.projectId,
    projectCode: row.project.code,
    projectName: row.project.name,
    amount: formatAmount(row.impactAmount),
    currency: 'SAR',
    budgetLineCategory: row.budgetLine?.category ?? 'عام',
    budgetLineDescription: row.budgetLine?.description ?? 'تغيير على مستوى المشروع',
    initiatorName: row.createdBy.name,
    createdAt: formatRequiredIsoTimestamp(row.createdAt),
    submittedAt: formatOptionalIsoTimestamp(row.submittedAt),
    detailsHref: `/variation-orders/${row.id}`,
    orderNumber: row.orderNumber,
    title: row.title,
    reason: row.reason,
    scopeImpact: row.scopeImpact ?? null,
    commitmentReference: row.commitment?.referenceNumber ?? null,
    commitmentVendorName: row.commitment?.vendorName ?? null,
    linesCount,
  };
}
