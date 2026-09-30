/**
 * tests/unit/app/navigation-completion.test.tsx
 *
 * Slice 16 — Navigation Completion UI Component Tests.
 *
 * Covers:
 * - EngineerTopBar renders /my-projects, /my-reports, /expenses, /custodies
 * - AccountantTopBar renders /payroll, /subcontractor-billings, /commitments, /custodies, /expenses
 * - PurchasingTopBar renders /commitments
 * - PendingApprovalsPanel links point to centralized approvals hub (/approvals?tab=...)
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { EngineerTopBar } from '@/components/shared/engineer-top-bar';
import { AccountantTopBar } from '@/components/shared/accountant-top-bar';
import { PurchasingTopBar } from '@/components/shared/purchasing-top-bar';
import { PendingApprovalsPanel } from '@/app/(manager)/dashboard/components/pending-approvals-panel';
import type { PendingApprovalsDTO } from '@/lib/dashboard/types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}));

describe('Slice 16 Navigation Completion UI Tests', () => {
  describe('EngineerTopBar', () => {
    it('renders all required engineer navigation links including expenses and custodies', () => {
      render(<EngineerTopBar />);

      const myProjectsLink = screen.getByTestId('nav-my-projects-link');
      expect(myProjectsLink.getAttribute('href')).toBe('/my-projects');

      const myReportsLink = screen.getByTestId('nav-my-reports-link');
      expect(myReportsLink.getAttribute('href')).toBe('/my-reports');

      const expensesLink = screen.getByTestId('nav-expenses-link');
      expect(expensesLink.getAttribute('href')).toBe('/expenses');

      const custodiesLink = screen.getByTestId('nav-custodies-link');
      expect(custodiesLink.getAttribute('href')).toBe('/custodies');
    });
  });

  describe('AccountantTopBar', () => {
    it('renders all required accountant navigation links', () => {
      render(<AccountantTopBar />);

      const payrollLink = screen.getByTestId('nav-payroll-link');
      expect(payrollLink.getAttribute('href')).toBe('/payroll');

      const billingsLink = screen.getByTestId('nav-subcontractor-billings-link');
      expect(billingsLink.getAttribute('href')).toBe('/subcontractor-billings');

      const commitmentsLink = screen.getByTestId('nav-commitments-link');
      expect(commitmentsLink.getAttribute('href')).toBe('/commitments');

      const custodiesLink = screen.getByTestId('nav-custodies-link');
      expect(custodiesLink.getAttribute('href')).toBe('/custodies');

      const expensesLink = screen.getByTestId('nav-expenses-link');
      expect(expensesLink.getAttribute('href')).toBe('/expenses');
    });
  });

  describe('PurchasingTopBar', () => {
    it('renders commitments navigation link for purchasing officer', () => {
      render(<PurchasingTopBar />);

      const commitmentsLink = screen.getByTestId('nav-commitments-link');
      expect(commitmentsLink.getAttribute('href')).toBe('/commitments');
    });
  });

  describe('PendingApprovalsPanel Links', () => {
    it('renders links pointing to centralized approvals hub with correct tabs when counts > 0', () => {
      const mockApprovals: PendingApprovalsDTO = {
        expenses: 3,
        commitments: 2,
        custodies: 4,
        payrollEntries: 5,
        subcontractorBillings: 1,
        total: 15,
      };

      render(<PendingApprovalsPanel approvals={mockApprovals} />);

      const expensesCard = screen.getByLabelText(/مصروفات معلقة: 3/);
      expect(expensesCard.getAttribute('href')).toBe('/approvals?tab=expenses');

      const commitmentsCard = screen.getByLabelText(/ارتباطات معلقة: 2/);
      expect(commitmentsCard.getAttribute('href')).toBe('/approvals?tab=commitments');

      const custodiesCard = screen.getByLabelText(/عهد معلقة: 4/);
      expect(custodiesCard.getAttribute('href')).toBe('/approvals?tab=custodies');

      const payrollCard = screen.getByLabelText(/رواتب معلقة: 5/);
      expect(payrollCard.getAttribute('href')).toBe('/approvals?tab=payroll');

      const billingsCard = screen.getByLabelText(/مستخلصات معلقة: 1/);
      expect(billingsCard.getAttribute('href')).toBe('/approvals?tab=billings');
    });

    it('does not wrap zero-count cards in links', () => {
      const zeroApprovals: PendingApprovalsDTO = {
        expenses: 0,
        commitments: 0,
        custodies: 0,
        payrollEntries: 0,
        subcontractorBillings: 0,
        total: 0,
      };

      render(<PendingApprovalsPanel approvals={zeroApprovals} />);

      expect(screen.queryByLabelText(/مصروفات معلقة/)).toBeNull();
      expect(screen.queryByLabelText(/ارتباطات معلقة/)).toBeNull();
      expect(screen.queryByLabelText(/عهد معلقة/)).toBeNull();
      expect(screen.queryByLabelText(/رواتب معلقة/)).toBeNull();
      expect(screen.queryByLabelText(/مستخلصات معلقة/)).toBeNull();
    });
  });
});
