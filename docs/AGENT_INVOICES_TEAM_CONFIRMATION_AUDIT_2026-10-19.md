# Ecom OS Agent Invoices and Team Confirmation Audit

**Audit date:** 19 October 2026  
**Supabase project:** `wxfialbmyfkafobtkrde` (`Cod Scale`)  
**Project status during audit:** `ACTIVE_HEALTHY`  
**Audit type:** Read-only source-code, schema, live-data, RLS, RPC, trigger, calculation, and contract-test review  
**Privacy:** This report intentionally excludes agent names, customer details, phone numbers, emails, order identifiers, and other PII.

## Executive summary

The confirmation-to-invoice foundation is functional:

- Orders can be assigned to agents.
- Confirmation changes are authorized server-side.
- Human confirmation events are captured separately from assignment history.
- Commission earnings use deterministic keys that prevent ordinary duplicate inserts.
- Earnings can be converted into itemized invoices.
- Payments are allocated to invoices and can be acknowledged or disputed.
- Payroll tables have RLS and browser clients receive read-only table access.

The current live `10 MAD` invoice is arithmetically correct. However, the system is not yet fully production-safe because of one critical database privilege issue, missing live deployment of online distribution, migration drift, and several financial consistency edge cases.

### Overall status

| Area | Status | Summary |
|---|---|---|
| Confirmation authorization | Working | Agents are checked for membership, permission, and assignment before saving. |
| Human commission attribution | Working | The earliest human confirmation event is the commission source. |
| Duplicate order commission protection | Working | Deterministic earning keys and a unique constraint prevent normal duplicates. |
| Invoice generation | Working with risks | Basic invoice creation works, but overlapping periods and late earnings are unsafe. |
| Payment allocation | Working | Allocation totals and invoice balances are validated server-side. |
| Agent payment acknowledgment | Working | An agent can acknowledge a payment once or open a dispute. |
| Online-only equal distribution | Not deployed live | The source migration exists locally, but its live functions and triggers are absent. |
| Payroll security | Critical issue | Internal SECURITY DEFINER functions are executable by `PUBLIC` and `anon`. |
| Rule version management | Incomplete | The UI creates new enabled rules instead of safely closing/versioning an existing rule. |
| Reversals and adjustments | Incomplete | Cancelled/returned outcomes do not automatically void or adjust prior earnings. |
| Migration integrity | Drifted | Relevant objects exist live, but their migration versions are missing from migration history. |

## Audit scope

The review covered:

- `src/pages/AgentInvoices.tsx`
- `src/services/agentPayrollService.ts`
- `src/pages/Team.tsx`
- `src/hooks/useTeamData.ts`
- `src/pages/Confirmation.tsx`
- `src/hooks/useConfirmationCRM.ts`
- `src/services/confirmationCrmService.ts`
- `src/pages/confirmation/ConfirmationOrderDrawer.tsx`
- `src/pages/confirmation/ConfirmationMetrics.tsx`
- `supabase/migrations/202608110003_confirmation_crm.sql`
- `supabase/migrations/20260922091324_team_real_agent_metrics.sql`
- `supabase/migrations/20260922102000_confirmation_agent_order_updates.sql`
- `supabase/migrations/20260922120000_agent_payroll_and_exclusive_assignment.sql`
- `supabase/migrations/20261018171517_online_confirmation_assignment.sql`
- Relevant live Supabase tables, functions, triggers, policies, grants, and aggregate data
- Team and payroll contract tests

No source files, database rows, database privileges, or deployed functions were changed during this audit.

## Live database snapshot

The connected project contained the following aggregate state at audit time.

### Confirmation and team state

| Metric | Live value |
|---|---:|
| Orders with a current assignee | 20 |
| Pending assigned orders | 15 |
| Confirmed assigned orders | 5 |
| Current Team confirmation rate | 25% |
| Delivered assigned orders | 1 |
| Coming-back assigned orders | 0 |
| Delivery rate under the current formula | 100% |
| Delivered revenue | 219 MAD |
| Upsell orders | 1 |
| Assignment-history rows | 20 |
| Assigned orders without assignment history | 0 |
| Latest assignment/history mismatches | 0 |
| Human confirmation events | 10 |
| Active exclusive-recipient rows | 0 |
| Shared assignment workspaces | 1 |
| Fresh online presence rows at audit time | 0 |
| `CALL_STARTED` activities | 3 |
| Saved call recordings | 0 |

The difference between `10` historical human confirmation events and `5` currently confirmed orders is expected under an event-ledger model: events preserve history while the order table stores the current state.

### Payroll state

| Metric | Live value |
|---|---:|
| Enabled payment rules | 1 |
| Payment-rule versions | 1 |
| Rule type | Per delivered order |
| Rule amount | 10 MAD fixed |
| Rule effective date | 18 October 2026 |
| Earning rows | 1 |
| Earning amount | 10 MAD |
| Earning type | Delivered commission |
| Earning status | Invoiced |
| Duplicate earning keys | 0 |
| Invoice rows | 1 |
| Invoice total | 10 MAD |
| Invoice/line total mismatches | 0 |
| Payments | 0 |
| Recorded payment amount | 0 MAD |
| Open payment disputes | 0 |
| Generated payroll periods | 2 |
| Overlapping payroll-period pairs | 1 |
| Payroll-generation audit actions | 3 |

The two payroll periods were:

1. `2026-10-11 00:00 UTC` to `2026-10-18 00:00 UTC`: no invoice.
2. `2026-10-12 00:00 UTC` to `2026-10-19 00:00 UTC`: one `10 MAD` invoice.

These periods overlap by six days.

## System data model

### Assignment and confirmation tables

| Table | Purpose |
|---|---|
| `orders` | Current order status, current assignee, totals, delivery state, confirmation actor, and upsell state. |
| `order_assignments` | Append-oriented assignment history. The latest row is treated as the historical assignment source. |
| `workspace_confirmation_assignment_settings` | Workspace mode: `shared` or `separated`. |
| `order_confirmation_recipients` | Exclusive active recipient in separated mode, with released rows retained as history. |
| `order_confirmation_events` | Immutable source event identifying human, WhatsApp, or manual-review confirmation. |
| `confirmation_activities` | CRM activity events such as order opened, call started, note added, and callback scheduled. |
| `confirmation_callbacks` | Scheduled and completed callback records. |
| `confirmation_call_recordings` | Private recording metadata and retention details. |
| `member_activity_log` | Team-facing activity timeline for assignment, CRM actions, status changes, and upsells. |

### Payroll tables

| Table | Purpose |
|---|---|
| `agent_payment_rules` | Stable rule identity and enabled/disabled state. |
| `agent_payment_rule_versions` | Effective-dated rule definitions and amounts. |
| `agent_earnings` | Authoritative accrued/invoiced earning ledger. |
| `agent_payroll_periods` | Payroll date windows and generation state. |
| `agent_invoices` | Agent invoice header, totals, status, and period. |
| `agent_invoice_lines` | Itemized snapshot of earnings included in an invoice. |
| `agent_bank_accounts` | Private agent payment details. |
| `agent_payments` | Recorded transfers. |
| `agent_payment_allocations` | Allocation of one payment across one or more invoices. |
| `agent_payment_proofs` | Private proof metadata pointing to the private storage bucket. |
| `agent_payment_acknowledgments` | Agent receipt response. |
| `agent_payment_disputes` | Open/resolved/dismissed transfer disputes. |
| `agent_payroll_audit_log` | Payroll and assignment management audit actions. |

## End-to-end confirmation and invoice workflow

```text
Order imported or created
        |
        v
Order assigned to an agent
        |
        v
Agent opens the order and contacts the customer
        |
        v
Agent saves a confirmation outcome
        |
        v
save_confirmation_order_v1 checks:
  - authentication
  - active membership
  - Confirmation permission
  - current assignment
  - allowed status and valid totals
        |
        v
For CONFIRMED:
  - status = confirmed
  - confirmed_at = now()
  - confirmation_method = call
  - confirmation_source = human
  - confirmed_by_user_id = actor
        |
        v
Order trigger creates immutable order_confirmation_event
        |
        v
Payment rules are evaluated for the first human confirmation event
        |
        v
Qualifying rows are inserted into agent_earnings
        |
        v
Owner generates a payroll period
        |
        v
Accrued earnings become invoice lines and are marked invoiced
        |
        v
Owner records payment and allocations
        |
        v
Agent acknowledges receipt or opens a dispute
```

## Confirmation authorization behavior

The authoritative save function is `save_confirmation_order_v1`.

It performs the following checks in the database:

1. Requires `auth.uid()`.
2. Requires an active `profile_workspaces` membership.
3. Allows team managers through `can_manage_workspace_team`.
4. Otherwise requires the profile's `allowed_sections` to contain `Confirmation`.
5. Validates the requested status against the accepted confirmation statuses.
6. Validates adjusted order totals.
7. Locks the order row with `FOR UPDATE`.
8. Resolves the latest assignment.
9. Requires a non-manager agent to be the current assignee.
10. Updates the order atomically.

Managers are intentionally allowed to update orders without being the assigned agent. Ordinary agents are not.

## Commission attribution

### Attribution source

Assignment does not directly create a commission.

The commission engine searches `order_confirmation_events` for the earliest event satisfying:

- Same workspace.
- Same order.
- `source = 'agent_call'`.
- `agent_id IS NOT NULL`.

Consequences:

- WhatsApp automation does not earn a human-agent commission.
- Reassigning an order later does not move the original commission.
- The Team dashboard may show the order under the new assignee while payroll stays with the original confirmer.
- A later second confirmation event does not replace the first event used for commission attribution.

### Duplicate prevention

Order earnings use a deterministic key:

```text
order:{order_id}:{confirmation_event_id}:{rule_version_id}:{earning_type}
```

`agent_earnings` enforces:

```sql
unique (workspace_id, earning_key)
```

Insertions use `ON CONFLICT DO NOTHING`. This prevents normal retries, trigger re-entry, and payroll sweeps from duplicating the same order/rule earning.

## Payment-rule calculations

### Per confirmed order

Condition:

```text
rule_type = per_confirmed_order
AND current order status = confirmed
```

Calculation:

```text
earning = configured fixed amount
```

### Per delivered order

Condition:

```text
rule_type = per_delivered_order
AND normalized shipping/delivery status is delivered, livré, or livre
```

Calculation:

```text
earning = configured fixed amount
```

### Upsell

Condition:

```text
rule_type = upsell
AND orders.is_upsell = true
```

Fixed calculation:

```text
earning = configured fixed amount
```

Percentage calculation:

```text
base = upsell_value if present, otherwise order total
earning = round(base * percentage / 100, 2)
earning = min(earning, configured cap) when a cap exists
```

The current UI sets `upsell_value` to the adjusted final order total, not the incremental increase. Example:

```text
Original total: 299 MAD
Adjusted total: 399 MAD
Rule: 10%
Current commission: 399 * 10% = 39.90 MAD
Increment-only commission would have been: (399 - 299) * 10% = 10 MAD
```

The intended business meaning must therefore be explicit: percentage of final adjusted sale versus percentage of the additional upsell value.

### Custom confirmed/delivered rules

The database supports fixed custom rules whose metric is `confirmed` or `delivered`. The current Team interface does not expose custom rules.

### Fixed salary

For every enabled fixed-salary rule applicable to the generated period:

```text
earning = full configured amount
```

There is no proration for:

- Partial periods.
- Agent join/leave dates.
- Attendance.
- Days worked.
- Overlapping periods.

The configured `period` field does not currently alter the calculation.

### Average answer-time bonus

The current Team form creates this rule with:

- Metric: `avg_answer_seconds`.
- Operator: `<`.
- Threshold: `30` seconds.
- Minimum sample size: `10`.
- Fixed bonus amount.

The payroll SQL calculates:

```text
average(activity.created_at - order.created_at)
for every CALL_STARTED activity in the payroll period
```

If the call count is at least the minimum sample and the average passes the operator/threshold, the full bonus is awarded.

This is not actual telephone answer duration. It is time from order creation to a recorded `CALL_STARTED` activity.

## Invoice calculation

Before closing a period, the generator rechecks orders confirmed before the period end so delayed delivery states can materialize earnings.

For each agent:

```text
total_earned = SUM(agent_earnings.amount)
WHERE status = accrued
  AND earned_at >= payroll_start
  AND earned_at < payroll_end

adjustment_total = 0 in the current generated workflow
total_amount = total_earned
```

Invoice number:

```text
AGT-{period-start-YYYYMMDD}-{first-8-characters-of-agent-UUID}
```

Each earning becomes an `agent_invoice_lines` row containing:

- Earning type.
- Description/rule type.
- Quantity.
- Unit amount.
- Final amount.
- Snapshot of the applicable rule version.

After line insertion, included earnings change from `accrued` to `invoiced` and receive the invoice ID.

### Current live example

```text
Enabled rule: 10 MAD per delivered order
Qualifying delivered orders: 1
Earning: 1 * 10 MAD = 10 MAD
Invoice total: 10 MAD
Recorded payments: 0 MAD
Remaining balance: 10 MAD
```

## Payment calculation

### Invoice-level payment

```text
invoice_paid = SUM(allocation.amount)
WHERE allocation.invoice_id = selected invoice
  AND linked payment.status = recorded

invoice_remaining = max(0, invoice.total_amount - invoice_paid)
```

### Dashboard totals

```text
total_earned = SUM(visible invoice.total_amount)

total_paid = SUM(visible payment.amount)
WHERE payment.status = recorded

remaining_balance = max(0, total_earned - total_paid)

awaiting_confirmation = SUM(recorded payment.amount)
WHERE no acknowledgment exists

disputed_transfers = SUM(recorded payment.amount)
WHERE an open dispute exists
```

### Server-side payment validation

The recording function:

1. Requires authentication.
2. Requires workspace payroll-management permission.
3. Requires an amount greater than zero.
4. Locks every referenced invoice.
5. Requires invoice workspace and agent to match the payment.
6. Requires every allocation to be greater than zero.
7. Rejects allocations above the remaining invoice balance.
8. Requires the sum of allocations to equal the payment amount.
9. Inserts the payment and immutable allocations.
10. Updates invoice status to `paid` or `partially_paid`.
11. Writes a payroll audit event.

### Payment proof

Accepted formats:

- PDF
- PNG
- JPEG
- WebP

Maximum size: `10 MB`.

Storage is private. The owner uploads into a workspace/payment-scoped path and the application creates a signed URL valid for 60 seconds when opening proof from the Agent Invoice page.

### Agent acknowledgment

Allowed outcomes:

- `received_full`
- `not_received`
- `received_different`

`received_different` requires an actual amount and explanation. Any outcome other than `received_full` creates or reopens a dispute. An acknowledgment is immutable after the first successful submission.

## Team-page calculations

The Team page calculates performance from each agent's **currently assigned orders** in `orders.assigned_to`.

| Metric | Exact definition |
|---|---|
| Assigned | Number of current orders assigned to the member. |
| Confirmed | Current confirmation status is `confirmed`, `shipped`, or `delivered`. |
| Confirmation rate | `confirmed / total_assigned * 100`. |
| Contacted | Current status is not null, `new`, or `pending`. |
| Cancelled | Status is `cancelled`, `returned`, or `refused`. |
| No answer | Status is `no_answer`, `unreachable`, or `wrong_number`. |
| Refused | Status is `refused`, `blacklisted`, or `duplicate`. |
| Callback fallback | Status is `scheduled` or `busy`. |
| Review | Status is `cancelled`, `refused`, `blacklisted`, `duplicate`, or `out_of_stock`. |
| Active/in progress | `new`, `pending`, `scheduled`, `busy`, `no_answer`, `unreachable`, or `wrong_number`. |
| Delivered | Normalized shipping status is `DELIVERED`. |
| In delivery | Shipping status is `SHIPPED`, `IN_TRANSIT`, or `OUT_FOR_DELIVERY`. |
| Returned | Shipping status is `COMING_BACK`. |
| Delivery rate | `delivered / (delivered + coming_back) * 100`. |
| Revenue | Sum of order total for delivered orders only. |
| Upsells | Current assigned orders where `is_upsell = true`. |
| Calls | Count of `CALL_STARTED` activities. |
| Call duration | Sum of stored recording seconds plus the current active-call timer. |
| Average first response | Average time from order creation to the first `CALL_STARTED` event for each order. |
| Session duration | Difference between the newest and oldest member activity recorded today. |
| Recent activity | Number of loaded member-activity rows since the start of yesterday. |

### Team conversion rate

The team-level conversion rate is:

```text
SUM(all agents' confirmed orders)
-------------------------------- * 100
SUM(all agents' assigned orders)
```

The live calculation is:

```text
5 confirmed / 20 assigned * 100 = 25%
```

### Delivery-rate implication

The denominator contains only delivered and coming-back orders. It excludes pending, shipped, in-transit, and out-for-delivery orders.

The live calculation is therefore:

```text
1 delivered / (1 delivered + 0 coming back) * 100 = 100%
```

This is a delivered-versus-returned success ratio, not delivered divided by all assigned orders.

### Session-time implication

Session duration is not actual online time. If an agent produces one activity at 09:00 and another at 17:00, the UI can show eight hours even if the agent was offline between those events.

## Confirmation-page calculations

The Confirmation CRM summary uses a database function and differs from the Team-page cards.

| Metric | Definition |
|---|---|
| Total orders | All orders in the workspace or assigned-agent scope. |
| Orders created today | `created_at` since database-day start. |
| Confirmed today | `confirmed_at` since database-day start. |
| Remaining | Status not in confirmed/cancelled/shipped/delivered/returned terminal groups. |
| Status counts | Count grouped by stored raw status. |
| Callbacks due | Scheduled callback with `scheduled_at <= now()`. |
| Callbacks overdue | Scheduled before the start of today. |
| Callbacks today | Scheduled during the current database day. |
| Calls today | Today's `CALL_STARTED` activity count. |
| Actions today | Count of today's confirmation activities. |
| Handled today | Distinct orders with an activity today. |

The visible Confirmation cards then calculate:

- **To confirm:** `pending + new` only.
- **No response:** `no_answer + unreachable + busy`.
- **Confirmation rate:** currently confirmed orders divided by total orders.
- **Confirmed today:** based on `confirmed_at`, not necessarily current status.

### Metric differences between pages

| Concept | Team page | Confirmation page |
|---|---|---|
| Confirmed | Confirmed, shipped, or delivered | Currently confirmed only for the rate card |
| No response | No-answer, unreachable, wrong-number | No-answer, unreachable, busy |
| Work remaining | Open-status list | Any status outside terminal groups |
| Agent scope | Current `orders.assigned_to` | Latest assignment ledger, with compatibility fallback |
| Date behavior | Mostly lifetime | Includes dedicated today metrics |

## Save and next behavior

When the agent clicks **Save & next**:

1. Unsaved upsell price is saved first when the chosen status is confirmed.
2. The confirmation status is saved.
3. Details and the queue are refreshed.
4. The UI identifies the next order in the currently loaded list.
5. A leaving state appears for approximately `180 ms`.
6. The next order opens and receives an entering indicator for approximately `850 ms`.
7. If no next order exists, the current selection closes and focus mode returns to the queue.

This switch does not request a fresh assignment. It moves through the orders already loaded into the current filtered queue.

## Assignment behavior

### Shared mode

Shared mode uses `orders.assigned_to` as the fast current-assignment field and `order_assignments` as history.

The intended eligible automatic recipients are:

- Active workspace member.
- Not the workspace owner.
- Role is `agent` or `supervisor`.
- Confirmation section is selected, or the older membership has an empty section list.
- Presence status is `online`.
- Heartbeat is less than two minutes old.

### Explicit owner bulk actions

The Team page supports:

- Select one or more open confirmation orders.
- Assign selected orders to one chosen eligible agent.
- Auto-split selected orders across online non-owner agents.
- Balance all open confirmation orders across online non-owner agents.

The browser fallback splits deterministically by order position:

```text
target_agent_index = order_index modulo number_of_online_agents
```

Target share displayed by the UI:

```text
share_percent = 100 / online_agent_count
```

Examples:

- 1 online agent: 100%.
- 2 online agents: 50% each.
- 3 online agents: approximately 33.33% each.
- 4 online agents: 25% each.

### Separated mode

Separated mode gives an eligible order exactly one active recipient:

- Human agent, or
- WhatsApp Automation.

The active-recipient row is unique per workspace/order. Reassignment releases the previous recipient row instead of deleting it. The confirmation trigger rejects:

- Human confirmation when the active recipient is WhatsApp.
- WhatsApp confirmation when the active recipient is human.
- Confirmation by a human different from the assigned exclusive agent.

Returning to shared mode requires releasing active separated recipients through reconciliation. Historical rows and historical commissions remain.

## Audit trails

The platform has multiple complementary audit layers.

### Assignment history

`order_assignments` stores every assignment row. The latest row synchronizes `orders.assigned_to`.

### Confirmation-source history

`order_confirmation_events` records the source and agent/automation identity used for commission attribution.

### CRM activity history

`confirmation_activities` records explicit actions including:

- Order opened.
- Note added.
- Call started/ended.
- Callback scheduled/completed.
- Recording saved.
- Upsell marked/removed.

### Team activity history

Database triggers add team-facing activity for:

- Order assigned.
- Manager assigning an order.
- Confirmation status changed.
- Shipping status changed by an authenticated member.
- Upsell marked or removed.

The current Team UI loads activity since the start of yesterday and lets the owner view today or yesterday. Older database records are not exposed by that view.

### Payroll audit history

`agent_payroll_audit_log` records actions such as:

- Orders assigned through exclusive assignment.
- Separated assignments reconciled.
- Payment rule versioned.
- Payroll generated.
- Payment recorded.

### Payment evidence

Payment, allocation, proof, acknowledgment, and dispute records are separate so the transfer trail remains reviewable.

## Security controls that are working

- Payroll tables have RLS enabled.
- Authenticated browser users receive SELECT, not direct INSERT/UPDATE/DELETE, on payroll tables.
- Owners/platform admins manage normal payroll operations through checked RPC functions.
- Agents can read only their own earnings, invoices, payments, acknowledgments, disputes, and related proof records.
- Payment-proof storage is private.
- Signed proof URLs are short-lived.
- Confirmation saving checks active membership and assignment in the database.
- Payment allocation validation is performed server-side inside a transaction.
- Earning keys are unique per workspace.
- Invoice creation is unique per workspace, agent, and payroll period.

## Findings and risks

### F-01 — Critical: public execution of internal payroll functions

**Affected functions:**

- `generate_agent_payroll_invoices_internal_v1`
- `materialize_agent_earnings_for_order_v1`

Both functions are `SECURITY DEFINER`. Live privilege inspection showed that both are executable by:

- `PUBLIC`
- `anon`
- `authenticated`
- `service_role`

The internal invoice generator does not perform an owner authorization check. The secure public wrapper does, but callers can bypass that wrapper by invoking the internal function directly.

**Impact:** Unauthorized financial-ledger mutation for a specified workspace, including creation of payroll periods/invoices under definer privileges.

**Required correction:**

1. Revoke EXECUTE from `PUBLIC`, `anon`, and `authenticated` on internal helper functions.
2. Grant only to the function owner/service role where required.
3. Keep authenticated execution only on the checked public wrapper.
4. Add a regression test that queries actual function privileges, not only migration text.

### F-02 — High: online-only automatic distribution is absent from live Supabase

The local migration defines:

- `distribute_online_confirmation_orders_v2`
- `distribute_online_confirmation_orders_internal_v2`
- `assign_new_confirmation_order_online_v2`
- `rebalance_confirmation_on_presence_v2`
- New-order trigger
- Presence-rebalance trigger

Live inspection found none of the public online-distribution function or automatic triggers.

**Current behavior:**

- Owner-triggered Auto-split works through the browser fallback.
- A newly imported order is not automatically assigned by the intended online-only database trigger.
- Agent presence changes do not automatically rebalance auto-managed orders.
- The live legacy auto-assignment RPC considers active agents but does not require a fresh online heartbeat.

### F-03 — High: live manual assignment RPC has a weaker target check

The live `assign_team_orders_v1` validates only that the target is an active team member. The newer local version additionally prevents owner targets and requires an eligible Confirmation agent/supervisor.

The current UI filters owner and ineligible targets, but a direct RPC caller with team-management permission can bypass the UI restriction.

### F-04 — High: overlapping payroll periods

The Agent Invoice page generates:

```text
start = local current date minus 7 days, converted to YYYY-MM-DD 00:00 UTC
end = local current date, converted to YYYY-MM-DD 00:00 UTC
```

Clicking on consecutive dates creates overlapping seven-day periods. Live data already contains an overlapping pair.

Order earnings usually resist duplication because of deterministic keys. Fixed salary and answer-time bonus earnings do not: their earning keys include the payroll-period ID. Overlapping periods can therefore pay overlapping salary or bonus windows more than once.

### F-05 — High: rule saves can stack commissions

The Team UI always passes `ruleId = null` when saving a payment rule. Every click creates a new enabled rule rather than a new version of an existing rule.

Example:

```text
Rule A: 10 MAD per delivered order, enabled
Rule B: 10 MAD per delivered order, enabled
Result: one delivered order can create 20 MAD
```

Even when the API is called with an existing rule ID, the previous version is not automatically closed by setting `effective_to`. Multiple versions can therefore overlap.

### F-06 — High: late earnings can create invoice-line/total inconsistency

When payroll is rerun for the exact same period:

- The existing invoice is reused through `ON CONFLICT`.
- New accrued earnings can be inserted as additional invoice lines.
- Those earnings are marked `invoiced`.
- The existing invoice's `total_earned` and `total_amount` are not recalculated.

This can create an invoice whose line total is larger than its payable header total.

No live mismatch existed at audit time, but the SQL path permits it.

### F-07 — High: no automatic earning reversal or adjustment

Once inserted, an earning is not automatically voided when:

- A confirmed order is later cancelled.
- A delivered order is later returned.
- An upsell is removed.
- Attribution is corrected.

The schema includes `void` earning status and `adjustment` earning type, but there is no complete adjustment workflow exposed through the current application.

### F-08 — Medium: Team response metric differs from payroll bonus metric

Team page:

```text
Uses only the first CALL_STARTED event per currently assigned order.
```

Payroll bonus:

```text
Uses every CALL_STARTED row in the payroll period.
```

An order called multiple times can therefore affect the paid bonus multiple times while appearing once in the displayed Team average.

### F-09 — Medium: invoice dispute state is not propagated to invoices

An acknowledgment of `not_received` or `received_different` creates an open payment dispute. It does not set related invoice status to `disputed`.

The invoice status enum supports `disputed`, but the current acknowledgment path does not use it.

### F-10 — Medium: reversal workflow is incomplete

The schema supports `agent_payments.status = reversed`, and the UI excludes reversed payments from paid totals. No normal UI/RPC reversal workflow was found, and invoice status is not automatically recalculated after a service-level reversal.

### F-11 — Medium: currency is effectively hardcoded to MAD

The database contains currency fields, but:

- Invoice loading does not select invoice currency.
- The UI money formatter always appends `MAD`.
- PDF statements always use `MAD`.
- New payments default to `MAD`.

Non-MAD bank accounts or invoices would display incorrectly.

### F-12 — Medium: rule/schedule/bank/dispute management is incomplete

The database supports features not fully available through the current interface:

- Edit/close/disable payment rule versions.
- Choose explicit payroll period dates.
- Save and edit payroll schedules.
- Save/edit bank-account details through the invoice interface.
- Create manual adjustments.
- Reverse transfers.
- Resolve or dismiss disputes.

### F-13 — Medium: metric queries are bounded

The Team hook loads bounded result sets:

- Assignment history: up to 5,000 rows.
- Member activity: up to 5,000 rows.
- Confirmation activities: up to 10,000 rows.
- Call recordings: up to 10,000 rows.
- Callbacks: up to 10,000 rows.

The assigned-order metric query is not explicitly paginated. Large workspaces can eventually display partial metrics depending on the API's configured response-row limit.

### F-14 — Medium/low: missing foreign-key indexes

Relevant unindexed foreign-key columns found in the live payroll schema include:

- `agent_earnings.confirmation_event_id`
- `agent_earnings.invoice_id`
- `agent_earnings.rule_version_id`
- `agent_payment_proofs.payment_id`
- Several workspace/actor/audit foreign keys

Current data volume is small, but joins, RLS checks, and cascade/restrict operations can become slower as the ledger grows.

### F-15 — Medium: confirmation date can be refreshed without a new earning

Saving `confirmed` again sets `confirmed_at = now()` again. The event/earning uniqueness rules prevent an ordinary duplicate earning, but the order can reappear in **Confirmed today** because its timestamp changed.

### F-16 — Medium: cancelled-after-confirmation can remain in Confirmed today

Changing an order from confirmed to cancelled does not clear `confirmed_at`. The summary counts `confirmed_at` for **Confirmed today** without requiring current status to remain confirmed.

### F-17 — Low/medium: percentage invoice-line display is misleading

For a percentage upsell rule, `unit_amount` stores the configured percentage while `amount` stores money. The invoice UI/PDF formats `unit_amount` as MAD, which can produce a line resembling:

```text
1 x 10.00 MAD = 39.90 MAD
```

The `10` is actually `10%`, not `10 MAD`.

## Migration drift

The following local migration versions were absent from live `supabase_migrations.schema_migrations`:

- `20260922091324_team_real_agent_metrics`
- `20260922102000_confirmation_agent_order_updates`
- `20260922120000_agent_payroll_and_exclusive_assignment`
- `20261018171517_online_confirmation_assignment`

Objects from the first three migrations exist in the live database, indicating that SQL was likely applied outside the normal migration-history path. The fourth migration's online-distribution objects do not exist live.

Risks from this drift:

- Source and live behavior are different.
- Contract tests can pass while production remains incomplete.
- A future migration deployment may attempt to reapply partially existing objects.
- Roll-forward and incident recovery become less predictable.
- Team members cannot reliably determine which schema version is deployed from migration history.

## RLS and privilege review

The following tables had RLS enabled with scoped SELECT policies and authenticated SELECT grants:

- `agent_earnings`
- `agent_invoice_lines`
- `agent_invoices`
- `agent_payment_acknowledgments`
- `agent_payment_allocations`
- `agent_payment_disputes`
- `agent_payment_proofs`
- `agent_payment_rule_versions`
- `agent_payment_rules`
- `agent_payments`
- `agent_payroll_audit_log`
- `order_confirmation_events`
- `order_confirmation_recipients`
- `workspace_confirmation_assignment_settings`

Normal payroll table writes are correctly routed through database functions. The critical exception is the EXECUTE privilege on the internal SECURITY DEFINER functions described in F-01.

## Test verification

Command executed:

```bash
npm run test:team
```

Result:

```text
23 tests
23 passed
0 failed
0 skipped
```

The tests verify source contracts for:

- Exclusive assignment structures.
- Immutable/deduplicated commission attribution.
- Invoice, payment, allocation, proof, acknowledgment, and dispute structures.
- Missing-schema handling.
- RLS source definitions.
- Team assignment and metrics.
- Online non-owner assignment migration content.
- Mobile/PWA team workflow.

Important limitation: these tests inspect local source and migration text. They do not prove that the same migration has been deployed to Supabase. This is why the online-assignment contract test passes while the corresponding live function and triggers are absent.

## Recommended remediation order

### Priority 1 — Close the critical function privilege bypass

- Revoke public/anonymous/authenticated EXECUTE on internal payroll helpers.
- Retain execution only for the checked wrapper, service role, and trigger-only functions where appropriate.
- Add a live privilege regression test.

### Priority 2 — Repair migration history and deploy online assignment

- Reconcile which SQL objects were applied manually.
- Create an idempotent repair migration rather than blindly rerunning old files.
- Deploy the online distribution functions and triggers.
- Verify new-order and presence-trigger behavior with two non-owner test agents.

### Priority 3 — Make payroll periods non-overlapping

- Let the owner select or preview the exact period.
- Reject overlapping generated periods for the same workspace unless explicitly correcting an existing period.
- Define calendar-aware weekly, biweekly, and monthly boundaries.
- Use workspace timezone consistently.

### Priority 4 — Correct payment-rule versioning

- Edit an existing rule by passing its stable rule ID.
- Close the previous version before inserting a new version.
- Prevent overlapping active versions for one rule.
- Add explicit enable/disable controls.
- Show a full version history.

### Priority 5 — Add financial correction paths

- Void or reverse eligible accrued earnings when business state changes.
- Use explicit negative/positive adjustment rows for invoiced earnings.
- Never mutate historical invoice lines silently.
- Require reasons and actor audit data for every correction.

### Priority 6 — Reconcile late earnings safely

Choose one policy:

1. Recalculate an unpaid existing invoice and its totals transactionally, or
2. Put late earnings into a supplemental adjustment invoice.

Do not attach new lines to an existing invoice without updating its totals.

### Priority 7 — Align visible and payable metrics

- Use first call per order for both Team metrics and answer-time bonus, or clearly label different definitions.
- Decide whether confirmation rate means confirmed/all assigned or confirmed/contacted.
- Rename delivery rate to delivered-versus-returned rate if keeping the current denominator.
- Define session time from presence intervals rather than first/last activity.

### Priority 8 — Complete invoice administration

- Currency-aware invoice and PDF formatting.
- Bank-account editing.
- Adjustment creation.
- Transfer reversal.
- Dispute resolution.
- Payroll schedule management.
- Explicit period selection and preview.

### Priority 9 — Scale and index review

- Move Team aggregates into database functions/views with workspace and date parameters.
- Avoid loading thousands of raw rows into the browser for aggregation.
- Add indexes for high-value foreign keys and RLS joins.
- Add test fixtures above API row limits.

## Source reference map

| Topic | Source |
|---|---|
| Invoice UI totals, payment entry, PDF | `src/pages/AgentInvoices.tsx` |
| Payroll client operations | `src/services/agentPayrollService.ts` |
| Team cards and assignment UI | `src/pages/Team.tsx` |
| Team metric calculations | `src/hooks/useTeamData.ts` |
| Confirmation page and Save & next | `src/pages/Confirmation.tsx` |
| Confirmation loading and realtime refresh | `src/hooks/useConfirmationCRM.ts` |
| Confirmation queries and mutations | `src/services/confirmationCrmService.ts` |
| Confirmation drawer | `src/pages/confirmation/ConfirmationOrderDrawer.tsx` |
| Confirmation summary cards | `src/pages/confirmation/ConfirmationMetrics.tsx` |
| CRM summary SQL | `supabase/migrations/202608110003_confirmation_crm.sql` |
| Team metrics and assignment triggers | `supabase/migrations/20260922091324_team_real_agent_metrics.sql` |
| Secure agent order updates | `supabase/migrations/20260922102000_confirmation_agent_order_updates.sql` |
| Payroll, earnings, invoices, payments, RLS | `supabase/migrations/20260922120000_agent_payroll_and_exclusive_assignment.sql` |
| Intended online equal distribution | `supabase/migrations/20261018171517_online_confirmation_assignment.sql` |
| Payroll contract tests | `tests/agent-payroll-contract.test.ts` |
| Team contract tests | `tests/team-management-contract.test.ts` |

## Final assessment

The system has a good ledger-based foundation. The separation between current assignment, immutable confirmation source, earnings, invoice lines, payments, allocations, acknowledgments, and disputes is the correct architecture for an auditable agent-payroll system.

The current `10 MAD` delivered-order invoice is correct, and there were no live duplicate earning keys or invoice-line mismatches at audit time.

Before relying on this system for regular agent payouts, the critical internal-function privileges must be closed, the live online-assignment migration must be deployed, payroll periods and rule versions must be made non-overlapping, and corrections/late earnings must receive an explicit accounting workflow.
