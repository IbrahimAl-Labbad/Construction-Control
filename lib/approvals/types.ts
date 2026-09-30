/**
 * lib/approvals/types.ts
 *
 * DTO and parameter types for the Centralized Manager Approvals Hub (Slice 15).
 * All types strictly observe the server/client serialization boundary:
 * - No Prisma model types
 * - No Decimal instances (monetary amounts are exact strings)
 * - No Date instances (timestamps and dates are ISO strings)
 *
 * Follows AGENTS.md §13 and §26.
 */

export type ApprovalDomain =
  | 'EXPENSE'
  | 'COMMITMENT'
  | 'CUSTODY'
  | 'PAYROLL'
  | 'SUBCONTRACTOR_BILLING';

export type BaseApprovalItemDTO = {
  id: string;
  domain: ApprovalDomain;
  status: 'SUBMITTED';
  projectId: string;
  projectCode: string;
  projectName: string;
  /** Exact decimal amount as string, e.g. "15000.00". Source: record.amount or grossAmount */
  amount: string;
  currency: 'SAR';
  budgetLineCategory: string;
  budgetLineDescription: string;
  /**
   * The user who originated the transaction, per domain semantics.
   */
  initiatorName: string;
  /** ISO-8601 string. Source: record.createdAt */
  createdAt: string;
  /** ISO-8601 string. Source: record.submittedAt */
  submittedAt: string | null;
  /** Direct navigation target. */
  detailsHref: string;
};

export type ExpenseApprovalItemDTO = BaseApprovalItemDTO & {
  domain: 'EXPENSE';
  description: string;
  /** ISO date string YYYY-MM-DD. Source: record.expenseDate */
  expenseDate: string;
  /** Source: custody.code or null */
  custodyCode: string | null;
};

export type CommitmentApprovalItemDTO = BaseApprovalItemDTO & {
  domain: 'COMMITMENT';
  vendorName: string;
  referenceNumber: string | null;
  /** ISO date string YYYY-MM-DD. Source: record.commitmentDate */
  commitmentDate: string;
  description: string;
  /**
   * Explicit submitter identity — distinct from initiatorName (createdBy).
   * Source: submittedBy.name or null.
   */
  submitterName: string | null;
};

export type CustodyApprovalItemDTO = BaseApprovalItemDTO & {
  domain: 'CUSTODY';
  /** Source: record.code */
  code: string;
  /** Source: custodian.name */
  custodianName: string;
  purpose: string;
  /** ISO date string YYYY-MM-DD or null. Source: record.expectedSettlementDate */
  expectedSettlementDate: string | null;
};

export type PayrollApprovalItemDTO = BaseApprovalItemDTO & {
  domain: 'PAYROLL';
  workerName: string;
  tradeOrTitle: string | null;
  periodYear: number;
  periodMonth: number;
  description: string;
};

export type BillingApprovalItemDTO = BaseApprovalItemDTO & {
  domain: 'SUBCONTRACTOR_BILLING';
  subcontractorName: string;
  referenceNumber: string | null;
  billingPeriod: string;
  /** ISO date string YYYY-MM-DD. Source: record.claimDate */
  claimDate: string;
  /** Source: commitment.referenceNumber or null */
  commitmentReference: string | null;
  /** Source: commitment.amount.toFixed(2) */
  commitmentAmount: string;
};

export type ApprovalItemDTO =
  | ExpenseApprovalItemDTO
  | CommitmentApprovalItemDTO
  | CustodyApprovalItemDTO
  | PayrollApprovalItemDTO
  | BillingApprovalItemDTO;

/** True pending counts — sourced from DB COUNT queries, never from items.length */
export type PendingCountsDTO = {
  expenses: number;
  commitments: number;
  custodies: number;
  payroll: number;
  billings: number;
  total: number;
};

/** Response shape for a paginated domain-specific tab */
export type DomainTabFeedDTO = {
  activeTab: 'expenses' | 'commitments' | 'custodies' | 'payroll' | 'billings';
  items: ApprovalItemDTO[];
  counts: PendingCountsDTO;
  pagination: {
    page: number;
    pageSize: number;
    /** Exact SUBMITTED count for this domain */
    totalItems: number;
    totalPages: number;
  };
};

/**
 * Response shape for the All tab — bounded triage view, page 1 only.
 *
 * INVARIANT: items.length <= counts.total is always true.
 * items.length is the materialized window; counts.total is the true database count.
 * These are NOT the same value when hasMoreBeyondWindow === true.
 */
export type AllTabFeedDTO = {
  activeTab: 'all';
  /** Globally sorted bounded candidates */
  items: ApprovalItemDTO[];
  /** True pending counts per domain from DB */
  counts: PendingCountsDTO;
  /** hasMoreBeyondWindow === true when counts.total > items.length */
  hasMoreBeyondWindow: boolean;
};

export type ApprovalsTab =
  | 'all'
  | 'expenses'
  | 'commitments'
  | 'custodies'
  | 'payroll'
  | 'billings';

export type ManagerApprovalsFeedDTO = AllTabFeedDTO | DomainTabFeedDTO;

export type ApprovalsSearchParams = {
  // Active domain tab. Defaults to 'all'.
  // Any unrecognized value falls back to 'all'.
  tab?: ApprovalsTab;

  // Page number for domain-specific tabs only.
  // Ignored when tab === 'all'. Defaults to 1.
  page?: string;
};
