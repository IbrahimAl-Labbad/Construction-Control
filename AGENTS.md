# =============================================================================
# CONSTRUCTION CONTROL — AGENTS.md
# PROJECT-LEVEL ENGINEERING CONTRACT
# =============================================================================
# This document is the authoritative engineering contract for all AI coding
# agents and human engineers working on this repository.
#
# Version: 1.1.0
# Last updated: 2026-09-13
#
# RULE: When in doubt, this document wins over assumptions, conventions,
# or any other documentation. Read it before writing a single line of code.
# =============================================================================

---

## 1. PRODUCT VISION

Construction Control is a **Management Control Layer** for a construction company.

It captures financial and operational signals from daily company activities and
converts them into:
- Management visibility
- Accountability chains
- Approval workflows
- Exception surfaces
- Executive reporting

The **manager** is the primary **consumer** of information.
Field staff (engineers, purchasing officers) are the primary **data providers**.
The manager should not be the primary data-entry user.

---

## 2. WHAT IS A CONTROL LAYER?

A Control Layer is not a transactional system. It is an **oversight layer**.

It sits above daily operations and answers questions like:
- "What was spent on Site A this week, by whom, approved by whom?"
- "Which custody claims are pending approval from engineers?"
- "Are we over or under budget on Project X?"
- "Which purchase requests are awaiting authorization?"
- "What is the current financial exposure across all active projects?"

The system records **what happened**, **who approved it**, and **when**.

### Key Characteristics

| Property           | Value                                    |
|--------------------|------------------------------------------|
| Primary consumers  | Manager, Executives                      |
| Primary data entry | Engineers, Accountants, Purchasing       |
| Data model style   | Append-only financial ledger             |
| Delete policy      | No hard deletes for financial records    |
| Currency precision | Decimal/fixed-point (never float)        |
| Language primary   | Arabic (RTL-first)                       |
| Audit requirement  | Every state change must be traceable     |

---

## 3. EXPLICIT SCOPE BOUNDARIES

### IN SCOPE — v1

- Expense capture and approval workflows
- Custody (advance payment) lifecycle
- Purchase request and approval
- Subcontractor billing capture
- Payroll data capture (NOT payroll processing)
- Budget tracking against actual spend
- Progress report submission by engineers
- Executive dashboard and reporting
- Role-based access control (4 roles, see §5)
- Audit trail for all financial events
- Arabic/RTL-first interface

### OUT OF SCOPE — PERMANENT

The following are **never** in scope for this system:

- Full ERP functionality
- Full accounting (journal entries, GL, AR/AP aging, bank reconciliation)
- HR/payroll processing or salary payment
- Inventory management (item catalogs, stock levels, warehouse)
- Project scheduling / Gantt charts / task management
- Time tracking / timesheets
- Customer relationship management (CRM)
- Document management (contracts, drawings)
- Procurement catalogs / vendor portals
- SMS / email notification platform
- Mobile-native apps (PWA is acceptable)
- Microservices architecture
- Message queues (Kafka, RabbitMQ, Redis Streams)
- GraphQL API
- Second frontend framework
- Second ORM or second database
- Kubernetes
- Real-time collaboration (WebSockets, CRDT)
- Blockchain / immutable ledger tech (append-only DB policy is sufficient)

If a feature is not explicitly in scope above, it is **out of scope**.
An AI agent must not introduce it without explicit written approval in a task brief.

---

## 4. OUT-OF-SCOPE FEATURES (Explicit List)

Do not implement, scaffold, or seed data for:

- [ ] General Ledger / Chart of Accounts
- [ ] Bank accounts / reconciliation
- [ ] Asset management / depreciation
- [ ] Tax management (VAT, withholding)
- [ ] Employee contracts / HR files
- [ ] Leave management / attendance
- [ ] Procurement catalogs / item master
- [ ] Customer/client CRM
- [ ] Project scheduling
- [ ] Time tracking
- [ ] Document version control
- [ ] SMS / push notifications
- [ ] Mobile apps (native iOS/Android)
- [ ] Multi-company / multi-tenant (v1 is single tenant)
- [ ] Multi-currency (v1 is SAR only)

---

## 5. FOUR V1 ROLES

There are exactly **four** roles. Do not add more. Do not merge them.

### 5.1 Manager

- Approves or rejects expense claims, custody requests, purchase orders
- Receives the executive dashboard and reports
- Is NOT responsible for routine data entry
- Has read access to all modules
- Final approval authority

### 5.2 Site Engineer

- Submits daily/weekly progress reports
- Submits expense claims for site operations
- Submits custody (advance) requests
- Cannot approve their own submissions
- Read-only to financial summaries

### 5.3 Accountant

- Records and reconciles expenses
- Manages payroll data entry (captures amounts, not processing)
- Reconciles custody settlements
- Prepares billing records for subcontractors
- Cannot approve purchase orders (purchasing authority belongs to Manager + Purchasing Officer)

### 5.4 Purchasing Officer

- Creates and manages purchase requests
- Manages vendor relationships and purchase orders
- Cannot approve their own requests (Manager approves)
- No access to payroll data

### Role Enum (Database)

```prisma
enum Role {
  MANAGER
  ENGINEER
  ACCOUNTANT
  PURCHASING
}
```

Do not change this enum in v1. Future roles require a migration and explicit task brief.

---

## 6. FULL-STACK ARCHITECTURE

This project is a full-stack Next.js application.

The repository contains both:
- **Frontend**
- **Backend / application services**
- **Database access**

Frontend and backend responsibilities must remain clearly separated even though they live in one Next.js repository.

### Core Architectural Rules:
1. **Do not place business logic inside React components.**
2. **Do not access Prisma directly from React components.**
3. **UI code must not contain financial business rules.**

---

## 7. SEPARATION OF CONCERNS & SYSTEM LAYERS

Use clean, explicit layers:

```
┌─────────────────────────────────────────────────────────┐
│ Presentation Layer (React Components, Pages, UI)        │
└───────────────────────────┬─────────────────────────────┘
                            │ Calls (Server Actions / APIs)
┌───────────────────────────▼─────────────────────────────┐
│ Application Layer (Use Cases, Services, Orchestration)  │
└───────────────────────────┬─────────────────────────────┘
                            │ Operates on
┌───────────────────────────▼─────────────────────────────┐
│ Domain Layer (Business Rules, Policies, Invariants)     │
└───────────────────────────┬─────────────────────────────┘
                            │ Persists via
┌───────────────────────────▼─────────────────────────────┐
│ Infrastructure Layer (Prisma, PostgreSQL, External SDKs)│
└─────────────────────────────────────────────────────────┘
```

### Layer Rules:
- **Presentation**: Must not contain business rules or financial calculations. Responsible only for rendering and user input capture.
- **Application**: Orchestrates use cases, enforces workflow sequences, coordinates transactions, and invokes domain logic and infrastructure.
- **Domain**: Pure business rules and policies. **Domain must not depend on React.** **Domain must not depend directly on Prisma.**
- **Infrastructure**: Implements persistence, database adapters, logger, and external integrations.
- **Validation**: Must be explicit at every system boundary.
- **Authorization**: Must be enforced server-side.

---

## 8. BACKEND RULE: EXPLICIT USE CASES

Every meaningful business action must have a dedicated, server-side use case or service.

Examples:
- `CreateExpense`
- `SubmitExpense`
- `ApproveExpense`
- `RejectExpense`
- `SettleCustody`
- `ApprovePurchase`

**Rule:** Do not implement business workflows or multi-step logic directly inside UI event handlers or inline server actions. Delegate immediately to an application service.

---

## 9. CLEAN CODE STANDARDS

All production code must follow Clean Code principles:

- **Meaningful names**: Intent-revealing names for variables, functions, types, and files.
- **Small, focused functions**: Do one thing and do it well.
- **Single responsibility**: Each module or class has one reason to change.
- **Low coupling & high cohesion**: Group related concepts together; decouple independent subsystems.
- **Avoid duplication (DRY)**: Centralize common domain algorithms and validation rules.
- **Avoid premature abstraction**: Write concrete, simple code first. Abstract only when a clear pattern repeats and justifies it.
- **Avoid speculative frameworks**: Do not build generic engines for hypothetical future needs.
- **Avoid magic numbers**: Use named constants or config objects with descriptive names.
- **Avoid hidden side effects**: Functions should be predictable and avoid mutating arguments.
- **Avoid deeply nested conditionals**: Use early returns, guard clauses, and polymorph/lookup tables.
- **Keep functions readable**: Code should read top-to-bottom like well-written prose.
- **Favor explicit code over clever code**: Code is read 10x more often than it is written. Optimize for maintainability and correctness, not code golf.

---

## 10. SOLID PRINCIPLES (PRAGMATIC APPLICATION)

Apply SOLID principles pragmatically to prevent fragile and rigid architecture:

1. **Single Responsibility Principle (SRP)**: Each class, service, or module focuses on a single business or infrastructure responsibility.
2. **Open/Closed Principle (OCP)**: Design domain policies so new roles, status transitions, or rules can be added without rewriting core workflows.
3. **Liskov Substitution Principle (LSP)**: Subtypes and implementations must adhere to the contracts expected by callers.
4. **Interface Segregation Principle (ISP)**: Clients should not be forced to depend on interfaces they do not use.
5. **Dependency Inversion Principle (DIP)**: High-level business use cases should depend on stable abstractions, not volatile low-level details.

**Crucial Caveat:**
- Do not introduce interfaces, factories, repositories, or abstractions unless they solve a real maintainability or testing problem.
- Avoid abstraction for abstraction's sake.

---

## 11. OOP AND DOMAIN DESIGN

Use object-oriented design where it improves domain modeling and encapsulates invariants.

### Appropriate Candidates for OOP:
- Financial domain rules
- Approval policies
- Authorization policies
- Custody lifecycle rules
- Domain services
- Value objects (e.g., Money, DateRange)
- Complex business calculations and state machine transitions

### Where NOT to Force OOP:
- Simple React components
- Data Transfer Objects (DTOs)
- Zod schemas
- Trivial utility functions

### The Architectural Hybrid:
Use a pragmatic hybrid:
- **OOP** for rich domain behavior, state transitions, and business invariants.
- **Functional programming** for deterministic, pure calculations and data transformations.
- **React patterns** for the presentation layer.
- **Explicit services** for application orchestration.

---

## 12. SECURITY BY DEFAULT

Security is part of every feature from inception, not an afterthought.

### Every feature must explicitly address:
- **Authentication**: Verified server-side session before processing.
- **Role authorization**: Verified user role against permission matrix.
- **Object-level authorization**: User must have access to the specific resource (e.g., specific project, custody record, or expense claim). Never trust user-supplied IDs.
- **Input validation**: Strict Zod validation on every input before database access.
- **Output sanitization**: Never leak internal details, database queries, or stack traces.
- **Secure file handling**: Validate MIME types, restrict file sizes, use secure object storage.
- **Rate limiting**: Enforce on public and sensitive endpoints (login, password reset).
- **Audit logging**: Record who, what, when, and previous state for all sensitive operations.
- **Secrets management**: Store credentials only in environment variables; never commit secrets.
- **Error handling**: Uniform `AppError` mapping to client-safe messages.
- **Data exposure**: Never expose data outside the user's authorization scope.
- **CSRF / XSS protection**: Secure cookie attributes, Content Security Policy, and Next.js built-in defenses.
- **Secure session handling**: Database-backed sessions with sliding inactivity expiration.

### Core Non-Negotiables:
1. **Never trust client-side authorization.**
2. **Never trust user-supplied IDs without verifying ownership/permission.**
3. **Never expose sensitive internal errors.**
4. **Never expose data outside the user's authorization scope.**

---

## 13. FINANCIAL SECURITY & DATA RULES

1. **Currency**: Saudi Riyal (SAR) only in v1.
2. **Precision**: Store money as `Decimal(15, 2)` in PostgreSQL via Prisma. Never use `Float` or `Number` for money calculations.
3. **Arithmetic**: All financial calculations must be performed server-side using exact decimal arithmetic (e.g., Prisma Decimal or `decimal.js`).
4. **Display**: Format with 2 decimal places using `Intl.NumberFormat('ar-SA', ...)` or locale equivalents.
5. **No floating-point money**:
   ```typescript
   // ❌ WRONG — floating-point precision loss
   const total = 10.1 + 20.2; // 30.299999999999997

   // ✅ CORRECT — exact decimal arithmetic
   import { Decimal } from '@prisma/client/runtime/library';
   const total = new Decimal('10.10').add(new Decimal('20.20'));
   ```
6. **Never trust client-submitted financial totals**: The server must recalculate and verify all line items, subtotals, and totals.
7. **Append-only ledger**: Approved financial records must never be mutated.
8. **No silent alterations**: Never silently alter settled transactions. Corrections require explicit reversal entries and audit trails.
9. **Never bypass approval workflows**: Financial records must advance through defined status transitions only.
10. **Zero amounts**: Must be explicitly validated if allowable.
11. **Negative amounts**: Only allowed for explicit reversal/correction entries.

---

## 14. NO HARD DELETES FOR FINANCIAL RECORDS

The following entities **must never be hard-deleted**:
- `Expense`
- `Custody`
- `Purchase` (request + order)
- `SubcontractorBill`
- `PayrollEntry`
- `BudgetLine`
- `ProgressReport` (financial sections)

Use soft-delete pattern:
```prisma
deletedAt DateTime? @db.Timestamptz
```

A record with `deletedAt != null` is considered deleted and must be excluded from all standard operational queries.

Allowed hard deletes:
- Draft/pending submissions that have never been submitted or approved (with explicit audit logging).

---

## 15. DATABASE SAFETY & INVARIANTS

Database writes must respect business invariants at the schema level:

1. **Relational constraints**: Use foreign keys with appropriate referential actions (`Restrict` / `Cascade` where valid).
2. **Uniqueness**: Enforce unique constraints on natural keys and combinations (e.g., `[projectId, code]`).
3. **Transactions**: Wrap multi-step financial operations in `prisma.$transaction` to guarantee atomicity.
4. **Indexes**: Index foreign keys and search/filter patterns based on real operational queries.
5. **Timestamps**: Every table must have timezone-aware timestamps:
   - `createdAt DateTime @default(now()) @db.Timestamptz`
   - `updatedAt DateTime @updatedAt @db.Timestamptz`
6. **Do not rely only on frontend validation**: Database and server-side validation are authoritative.

---

## 16. API & INPUT VALIDATION RULES

1. **All inputs must be validated with Zod before touching the database.**
2. Validation schemas reside in `lib/validation/schemas/` organized by domain.
3. Always use `schema.safeParse(input)` or the `validate()` helper in server actions and API routes.
4. Never pass raw `request.body` to Prisma queries.
5. Structured error responses: Return HTTP 400 with machine-readable error codes and field-level paths:
   ```json
   {
     "error": "VALIDATION_ERROR",
     "message": "بيانات غير صالحة",
     "details": [{ "path": "amount", "message": "المبلغ يجب أن يكون أكبر من صفر" }]
   }
   ```

---

## 17. AUTHENTICATION RULES

1. **Framework**: NextAuth.js (Auth.js) v4 with Prisma adapter.
2. **Strategy**: Database sessions (`strategy: 'database'`) stored in PostgreSQL.
3. **Credentials**: Email + password with bcrypt hashing (minimum 12 rounds).
4. **Providers**: Credentials provider only in v1. No public registration; Manager creates accounts.
5. **Session**: Server-side session validation on every protected route and action via `getServerSession()`.
6. **Expiry**: 24-hour sliding inactivity timeout; absolute expiry at 30 days.
7. **Active status check**: Inactive users (`isActive = false`) must be blocked at session creation AND rejected on every request.

---

## 18. AUTHORIZATION RULES

1. Authorization logic lives in `lib/permissions/`.
2. **Never put authorization logic directly inside React components.**
3. **Server Components** must call `requireRole()` or `requireAuth()` at the top level.
4. **API Routes & Server Actions** must call authorization guards before any business logic:
   - Step 1: Verify authentication (`requireAuth`).
   - Step 2: Verify `user.isActive === true`.
   - Step 3: Verify role satisfies required permission (`requireRole`).
   - Step 4: Verify resource-level ownership or project assignment.
   - Step 5: Execute domain logic.
5. **Middleware** provides coarse-grained route protection (redirecting unauthenticated users to `/login`).

---

## 19. RTL / ARABIC-FIRST UI RULES

1. **Root HTML element**: `<html lang="ar" dir="rtl">`
2. **All layout must use CSS Logical Properties**:
   - Use `ms-*` / `me-*` instead of `ml-*` / `mr-*`
   - Use `ps-*` / `pe-*` instead of `pl-*` / `pr-*`
   - Use `start` / `end` instead of `left` / `right`
   - Use `border-s` / `border-e` instead of `border-l` / `border-r`
   - Use `inset-inline-start` / `inset-inline-end` instead of `left` / `right`
3. **Font**: Use an Arabic-compatible font stack (`IBM Plex Arabic`, `Cairo`) via Google Fonts.
4. **Typography**: Arabic text direction is RTL. Form labels and text inputs are right-aligned.
5. **Tables**: Column order is right-to-left for Arabic reading flow.
6. **Locale**: Default to `ar-SA` for dates, numbers, and currency formatting.

---

## 20. TESTING REQUIREMENTS

Every business feature must include automated tests across multiple tiers:

### 1. Unit Tests (Vitest)
- Location: `tests/unit/`
- Scope: Pure domain rules, value objects, state machine transitions, validation schemas, permission helpers, utility functions.
- Required coverage: > 80% for `lib/` and domain logic.

### 2. Integration Tests (Vitest)
- Location: `tests/integration/`
- Scope: Database operations, repository/service use cases, transaction boundaries.

### 3. Authorization Tests
- Explicit tests verifying that unauthorized roles and inactive users are blocked from every protected use case.

### 4. End-to-End Tests (Playwright)
- Location: `tests/e2e/`
- Scope: Critical user flows (e.g., login, approval workflows, submission lifecycles).

### Negative Tests for Security-Sensitive Paths:
All security and financial paths must have negative tests:
- Unauthorized user rejected
- Inactive user rejected
- Wrong project rejected (object-level access control)
- Invalid status transition rejected
- Malformed input rejected
- Duplicate financial operation handled safely (idempotency)

---

## 21. AUDITABILITY REQUIREMENTS

Every significant state change in the system must produce an append-only audit trail entry:
- User login / logout / failed login attempts
- Record creation (expense, custody, purchase, billing, payroll)
- Status changes (pending → approved / rejected)
- User account creation, deactivation, and role changes
- Any administrative action by Manager

### Rules:
1. Audit logs are **never deleted** (no soft delete, no hard delete).
2. Audit logs are **append-only**.
3. Audit logs must be written in the **same transaction** as the audited operation.
4. Failed audit log writes must **roll back** the entire transaction.

---

## 22. CODE REVIEW CHECKLIST

Before considering any feature or PR complete, verify every category:

### Architecture
- [ ] Correct layer (Presentation, Application, Domain, Infrastructure)
- [ ] No business logic in UI components or event handlers
- [ ] No direct Prisma calls from React components
- [ ] No unnecessary or premature abstraction

### Code Quality
- [ ] Clean code: readable, self-documenting, meaningful names
- [ ] Strictly typed: no unexplained `any`, no ignored compiler warnings
- [ ] Single responsibility per module and function
- [ ] No duplicated logic (DRY)
- [ ] No dead code or unused imports

### Security
- [ ] Authentication verified server-side
- [ ] Role authorization verified
- [ ] Resource/object-level authorization verified (no trusting client IDs)
- [ ] Inputs validated with Zod
- [ ] Sensitive data and internal errors protected

### Financial Integrity
- [ ] Exact decimal arithmetic (no floating-point money)
- [ ] Server-side recalculation of totals
- [ ] Correct transaction boundaries (`prisma.$transaction`)
- [ ] Audit requirements satisfied
- [ ] No destructive mutations on approved records

### Testing
- [ ] Happy path covered
- [ ] Failure / rejection path covered
- [ ] Authorization / permission path covered
- [ ] Important edge cases and boundaries tested

---

## 23. DEFINITION OF DONE

A feature is not done simply because the page renders or works in the browser.

A feature is done **ONLY** when:
- [ ] Frontend works with RTL Arabic-first UI
- [ ] Backend use case / service is implemented server-side
- [ ] Business rules and invariants are encapsulated in the domain
- [ ] Server-side authorization is enforced (coarse and object-level)
- [ ] Zod validation exists and is enforced
- [ ] Database constraints and transactions are correct
- [ ] Automated tests pass (unit, integration, authorization)
- [ ] Negative security tests verify rejections
- [ ] Security and data exposure concerns are reviewed
- [ ] Audit trail requirements are satisfied
- [ ] Financial data uses Decimal with exact arithmetic
- [ ] TypeScript typecheck passes with 0 errors (`npm run typecheck`)
- [ ] ESLint passes with 0 warnings and 0 errors (`npm run lint`)
- [ ] Production build succeeds (`npm run build`)
- [ ] Documentation is updated when architecture changes

---

## 24. AGENT BEHAVIOR & DISCIPLINE

Act as a senior software engineer, not a reckless code generator.

### Protocol Before Implementing Any Feature:
1. **Understand the requirement** completely.
2. **Inspect the existing architecture** and established patterns.
3. **Identify affected layers** (Presentation, Application, Domain, Infrastructure).
4. **Identify security implications** (authentication, authorization, object access).
5. **Identify data integrity implications** (transactions, decimals, invariants).
6. **Define acceptance criteria** and test scenarios.
7. **Implement the smallest correct solution** that satisfies all rules.
8. **Test it thoroughly** (including negative tests).
9. **Review it against the Code Review Checklist (§22)**.
10. **Only then consider refactoring.**

### Non-Negotiable Restraints:
- **Do not over-engineer.**
- **Do not create abstractions simply because they are considered "enterprise patterns."**
- **Choose the simplest architecture that preserves correctness, security, maintainability, and future growth.**
- **Never introduce features, dependencies, or database tables not explicitly requested in the task brief.**

---

## 25. ROADMAP GUARDRAILS

### v1 Vertical Slices:
1. Authentication & Session Management
2. User Management (Manager creates/deactivates users)
3. Project Setup (Manager creates projects with budgets)
4. Expense Capture & Approval Workflow
5. Custody Request & Settlement Workflow
6. Purchase Request & Approval Workflow
7. Subcontractor Billing Capture
8. Payroll Data Entry (Amounts only, no processing)
9. Executive Dashboard (Budget vs. actual, pending approvals)
10. Progress Reports by Site Engineer

---

## APPENDIX: Project Structure Reference

```
/app
  /(auth)          → Login, logout pages
  /(manager)       → Manager-only pages and dashboards
  /(engineer)      → Site engineer pages and submissions
  /(accountant)    → Accountant pages and reconciliations
  /(purchasing)    → Purchasing officer pages and vendor POs
  /api             → API route handlers
    /auth          → NextAuth route handler

/components
  /ui              → shadcn/ui primitives (Button, Card, Input, etc.)
  /shared          → Shared layout components (Header, Sidebar, Shell, etc.)

/lib
  /auth            → NextAuth config, session helpers, types
  /db              → Prisma singleton client
  /permissions     → Role definitions, server guards, policies
  /validation      → Zod schemas and validation helpers
  /logger          → Centralized logging abstraction
  /errors          → Typed application errors and HTTP mapping
  /config          → Typed environment variable validation
  /utils           → Generic utility functions (cn, formatters)

/prisma
  schema.prisma    → Prisma schema (PostgreSQL)
  /migrations      → Committed database migration history

/tests
  /unit            → Vitest unit tests (domain, utils, validation)
  /integration     → Vitest integration tests (database, services)
  /e2e             → Playwright end-to-end user flow tests

/docs
  architecture.md  → System architecture and sequence diagrams
  development.md   → Development setup and command reference
  authorization.md → Security and authorization model

/public            → Static assets
```

---

*End of AGENTS.md — Version 1.1.0*
*This document is the supreme engineering contract of this repository.*
*Future AI agents: Read this document before making any change.*
