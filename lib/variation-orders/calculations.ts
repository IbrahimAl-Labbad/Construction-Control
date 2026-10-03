/**
 * lib/variation-orders/calculations.ts
 *
 * Authoritative financial and quantitative calculations for Variation Orders (Slice 20).
 * Uses exact Prisma.Decimal arithmetic — strictly adheres to AGENTS.md §13 (no IEEE 754 float math).
 *
 * SERVER-ONLY: imports Prisma.Decimal which is a server runtime dependency.
 * Do not import from 'use client' components.
 *
 * Financial Rules:
 *   - Revised Approved Budget = Original Budget + Approved Variations Impact
 *   - Revised Line Ceiling = Original Line Amount + Approved Line Variations Impact
 *   - Effective Commitment Ceiling = Original Commitment Amount + Approved Variations Impact
 *   - Only APPROVED variations affect authorized / revised financial limits.
 *   - DRAFT, SUBMITTED, and REJECTED variations MUST NEVER alter approved limits.
 *   - Financial delta can be positive (cost increase), negative (cost reduction), or zero (cost neutral).
 */

import { Prisma, VariationOrderStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export type DecimalLike = Prisma.Decimal | string | number;

export function toDecimal(val: DecimalLike): Prisma.Decimal {
  if (val instanceof Prisma.Decimal) return val;
  return new Prisma.Decimal(String(val));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LineCalculationInput = {
  originalQuantity: DecimalLike;
  revisedQuantity: DecimalLike;
  originalRate: DecimalLike;
  revisedRate: DecimalLike;
};

export type LineCalculationResult = {
  originalQuantity: Prisma.Decimal;
  revisedQuantity: Prisma.Decimal;
  quantityDelta: Prisma.Decimal;
  originalRate: Prisma.Decimal;
  revisedRate: Prisma.Decimal;
  originalTotal: Prisma.Decimal;
  revisedTotal: Prisma.Decimal;
  financialDelta: Prisma.Decimal;
  financialDeltaFormatted: string;
};

export type ProjectVariationsSummaryResult = {
  originalBudget: Prisma.Decimal;
  approvedVariationsTotal: Prisma.Decimal;
  revisedApprovedBudget: Prisma.Decimal;
  pendingVariationsTotal: Prisma.Decimal;
  projectedBudget: Prisma.Decimal;
  draftVariationsTotal: Prisma.Decimal;
  rejectedVariationsTotal: Prisma.Decimal;
  totalApprovedIncreases: Prisma.Decimal;
  totalApprovedDecreases: Prisma.Decimal;
  counts: {
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
    total: number;
  };
};

// ---------------------------------------------------------------------------
// Pure Calculation Functions
// ---------------------------------------------------------------------------

/**
 * Calculates quantitative and financial deltas for a single BOQ line item.
 * Supports both object input and 4-argument positional input.
 *
 * quantityDelta = revisedQuantity - originalQuantity
 * originalTotal = originalQuantity * originalRate
 * revisedTotal  = revisedQuantity * revisedRate
 * financialDelta = revisedTotal - originalTotal
 */
export function calculateLineFinancialDelta(
  inputOrOrigQty: LineCalculationInput | DecimalLike,
  revisedQty?: DecimalLike,
  origRate?: DecimalLike,
  revRate?: DecimalLike,
): LineCalculationResult {
  let origQtyDec: Prisma.Decimal;
  let revQtyDec: Prisma.Decimal;
  let origRateDec: Prisma.Decimal;
  let revRateDec: Prisma.Decimal;

  if (typeof inputOrOrigQty === 'object' && !(inputOrOrigQty instanceof Prisma.Decimal)) {
    origQtyDec = toDecimal(inputOrOrigQty.originalQuantity);
    revQtyDec = toDecimal(inputOrOrigQty.revisedQuantity);
    origRateDec = toDecimal(inputOrOrigQty.originalRate);
    revRateDec = toDecimal(inputOrOrigQty.revisedRate);
  } else {
    origQtyDec = toDecimal(inputOrOrigQty);
    revQtyDec = toDecimal(revisedQty ?? '0');
    origRateDec = toDecimal(origRate ?? '0');
    revRateDec = toDecimal(revRate ?? '0');
  }

  const quantityDelta = revQtyDec.sub(origQtyDec);
  const originalTotal = origQtyDec.mul(origRateDec);
  const revisedTotal = revQtyDec.mul(revRateDec);
  const financialDelta = revisedTotal.sub(originalTotal);

  return {
    originalQuantity: origQtyDec,
    revisedQuantity: revQtyDec,
    quantityDelta,
    originalRate: origRateDec,
    revisedRate: revRateDec,
    originalTotal,
    revisedTotal,
    financialDelta,
    financialDeltaFormatted: financialDelta.toFixed(2),
  };
}

/**
 * Calculates total financial impact from a list of line items or deltas.
 * Sums the financialDelta of all lines.
 */
export function calculateVariationOrderTotalImpact(
  lines: ReadonlyArray<{ financialDelta: DecimalLike } | DecimalLike>,
): Prisma.Decimal {
  const zero = new Prisma.Decimal('0.00');
  return lines.reduce<Prisma.Decimal>((acc, item) => {
    if (typeof item === 'object' && !(item instanceof Prisma.Decimal) && 'financialDelta' in item) {
      return acc.add(toDecimal(item.financialDelta));
    }
    return acc.add(toDecimal(item as DecimalLike));
  }, zero);
}

/**
 * Calculates the Revised Approved Budget:
 * Revised Approved Budget = Original Budget + Approved Variation Orders Total
 */
export function calculateRevisedBudget(
  originalBudgetTotal: DecimalLike,
  approvedVariations: DecimalLike | ReadonlyArray<DecimalLike | { impactAmount: DecimalLike }>,
): Prisma.Decimal {
  const orig = toDecimal(originalBudgetTotal);
  if (Array.isArray(approvedVariations)) {
    const sum = approvedVariations.reduce<Prisma.Decimal>((acc, item) => {
      if (typeof item === 'object' && !(item instanceof Prisma.Decimal) && 'impactAmount' in item) {
        return acc.add(toDecimal(item.impactAmount));
      }
      return acc.add(toDecimal(item as DecimalLike));
    }, new Prisma.Decimal('0.00'));
    return orig.add(sum);
  }
  return orig.add(toDecimal(approvedVariations as DecimalLike));
}

/**
 * Calculates the Revised Budget Line Ceiling:
 * Revised Line Ceiling = Original Line Amount + Approved Line Variations Impact
 */
export function calculateRevisedBudgetLineCeiling(
  originalLineAmount: DecimalLike,
  approvedLineVariations: DecimalLike | ReadonlyArray<DecimalLike | { impactAmount: DecimalLike }>,
): Prisma.Decimal {
  const orig = toDecimal(originalLineAmount);
  if (Array.isArray(approvedLineVariations)) {
    const sum = approvedLineVariations.reduce<Prisma.Decimal>((acc, item) => {
      if (typeof item === 'object' && !(item instanceof Prisma.Decimal) && 'impactAmount' in item) {
        return acc.add(toDecimal(item.impactAmount));
      }
      return acc.add(toDecimal(item as DecimalLike));
    }, new Prisma.Decimal('0.00'));
    return orig.add(sum);
  }
  return orig.add(toDecimal(approvedLineVariations as DecimalLike));
}

/**
 * Calculates the Effective Commitment Ceiling:
 * Effective Commitment Ceiling = Original Commitment Amount + Approved Variations Impact
 */
export function calculateEffectiveCommitmentCeiling(
  originalCommitmentAmount: DecimalLike,
  approvedVariations: DecimalLike | ReadonlyArray<DecimalLike | { impactAmount: DecimalLike }>,
): Prisma.Decimal {
  const orig = toDecimal(originalCommitmentAmount);
  if (Array.isArray(approvedVariations)) {
    const sum = approvedVariations.reduce<Prisma.Decimal>((acc, item) => {
      if (typeof item === 'object' && !(item instanceof Prisma.Decimal) && 'impactAmount' in item) {
        return acc.add(toDecimal(item.impactAmount));
      }
      return acc.add(toDecimal(item as DecimalLike));
    }, new Prisma.Decimal('0.00'));
    return orig.add(sum);
  }
  return orig.add(toDecimal(approvedVariations as DecimalLike));
}

/**
 * Calculates comprehensive project variation summary metrics across all statuses.
 * Distinguishes strictly between DRAFT, SUBMITTED, APPROVED, and REJECTED states.
 */
export function calculateProjectVariationsSummary(
  originalBudget: DecimalLike,
  variations: ReadonlyArray<{
    status: VariationOrderStatus | string;
    impactAmount: DecimalLike;
  }>,
): ProjectVariationsSummaryResult {
  const origBudgetDec = toDecimal(originalBudget);
  const zero = new Prisma.Decimal('0.00');

  let approvedTotal = zero;
  let pendingTotal = zero;
  let draftTotal = zero;
  let rejectedTotal = zero;
  let totalApprovedIncreases = zero;
  let totalApprovedDecreases = zero;

  const counts = {
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    total: variations.length,
  };

  for (const vo of variations) {
    const impact = toDecimal(vo.impactAmount);

    switch (vo.status) {
      case VariationOrderStatus.APPROVED:
        approvedTotal = approvedTotal.add(impact);
        counts.approved += 1;
        if (impact.greaterThan(zero)) {
          totalApprovedIncreases = totalApprovedIncreases.add(impact);
        } else if (impact.lessThan(zero)) {
          totalApprovedDecreases = totalApprovedDecreases.add(impact.abs());
        }
        break;

      case VariationOrderStatus.SUBMITTED:
        pendingTotal = pendingTotal.add(impact);
        counts.submitted += 1;
        break;

      case VariationOrderStatus.DRAFT:
        draftTotal = draftTotal.add(impact);
        counts.draft += 1;
        break;

      case VariationOrderStatus.REJECTED:
        rejectedTotal = rejectedTotal.add(impact);
        counts.rejected += 1;
        break;
    }
  }

  const revisedApprovedBudget = origBudgetDec.add(approvedTotal);
  const projectedBudget = revisedApprovedBudget.add(pendingTotal);

  return {
    originalBudget: origBudgetDec,
    approvedVariationsTotal: approvedTotal,
    revisedApprovedBudget,
    pendingVariationsTotal: pendingTotal,
    projectedBudget,
    draftVariationsTotal: draftTotal,
    rejectedVariationsTotal: rejectedTotal,
    totalApprovedIncreases,
    totalApprovedDecreases,
    counts,
  };
}
