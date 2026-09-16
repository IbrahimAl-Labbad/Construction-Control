import type { BudgetCategory } from '@/lib/budget';

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  MATERIALS: 'مواد وتوريدات',
  LABOR: 'عمالة موقع مباشرة',
  SUBCONTRACTOR: 'مقاولو باطن',
  EQUIPMENT: 'معدات وآليات',
  SITE_OPERATIONS: 'مصاريف تشغيل الموقع',
  CONTINGENCY: 'احتياطي طوارئ',
};

export function getBudgetCategoryLabel(category: BudgetCategory): string {
  return BUDGET_CATEGORY_LABELS[category] ?? category;
}
