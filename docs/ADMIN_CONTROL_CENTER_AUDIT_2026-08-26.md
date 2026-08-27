# Ecom OS Admin Control Center — Phase 0 Audit

Date: 2026-08-26  
Scope: active `/admin`, legacy Admin/Super Admin, frontend authorization, Supabase schema/migrations/RPC/RLS, support mode, subscriptions, KPIs, AI, integrations, health, logs and testing.

This report is an implementation map, not a completion claim. It records verified repository and linked-production facts that the canonical rebuild must preserve or correct.

## Implementation status update

The repository rebuild now includes:

- canonical Platform Admin roles and permission-scoped navigation/RPC guards;
- dedicated Command Center, Sellers, Users/User 360, Workspaces, Orders,
  Products, Campaigns, Subscriptions, Payments and Plans routes;
- protected root-Founder assignment and hardened audit helpers;
- expiring, server-validated Support Mode with read-only RLS, explicit short
  write elevation, a persistent countdown banner, and correct preview-profile
  permissions;
- owner-level official MAD subscriptions, private payment proofs, atomic review,
  effective limits/entitlements and usage counters;
- secure Auth ban/unban/force-logout/hard-delete implementation through the
  `platform-account-admin` Edge Function;
- signup plan registration after the real Auth session exists;
- canonical paginated seller/product/campaign/user services and corrected
  delivered-revenue/status calculations;
- a numbered, transaction-safe SQL installation guide and read-only verifier.

The live Supabase project is **not yet updated by this workspace change**. Its
history is drifted, so no `db push` was performed. The numbered SQL files must
be run whole and in order, then the Edge Function must be explicitly deployed.
The remaining release gate is live verification: all installation checks must
return `PASS`, followed by founder/non-founder RLS and Support Mode smoke tests.

## Executive findings

1. `/admin` is the only active platform-control route, but it is a thin route switch over several V1/V2/V3 RPC generations. `/admin/workspaces` incorrectly renders the Users page.
2. Two retired Admin generations remain in the repository. Most are dead, while two legacy Super Admin AI components are imported by the active Admin Pro console.
3. The linked production migration ledger is not a reliable description of the production schema. Most repository migrations after `054` are not recorded remotely, yet many of their tables exist in production. Several local migrations reuse the same version number, so `supabase db push` is unsafe until history is repaired.
4. The browser has only the Supabase public key, which is correct. Privileged Admin mutations mostly use RPCs, but legacy code still performs direct browser reads/writes against billing and platform tables.
5. Current Support Mode is not a security boundary. It records a server session, then changes only the React-selected workspace/profile while the caller remains the unrestricted founder. Read-only mode and server-enforced write elevation do not exist.
6. The V3 audit helper can insert audit rows without checking founder authorization. Existing `SECURITY DEFINER` functions commonly use a mutable `public, auth` search path and do not consistently revoke default `PUBLIC` execution.
7. Subscription state is split between old workspace-level Free/Starter/Pro/Enterprise USD records, `workspaces.plan`, workspace limits, and the new landing pricing config. There is no owner-level effective-subscription resolver.
8. The seller KPI engine correctly treats delivered order value as revenue, but the Admin snapshot sums all order totals. Admin, seller, and finance reporting therefore disagree.
9. Existing health cards are database-derived but do not measure Auth, Realtime, Storage, Edge Functions, webhooks, workers, or external providers end-to-end. They cannot be presented as platform health.
10. The current test suite covers i18n, notifications, TikTok and WhatsApp. There are no Admin authorization, account action, support mode, KPI, subscription, payment or RLS regression tests.

## Active architecture

### Routing

`src/App.tsx` is authoritative:

- `/admin` and `/admin/*` render `AdminPro` inside `FounderRoute` and `AdminProLayout`.
- `/super-admin/*` redirects to `/admin`.
- Seller routes are under `ProtectedRoute` and `AppLayout`.

`src/pages/admin/AdminPro.tsx` currently maps:

| Route | Active screen | Finding |
| --- | --- | --- |
| `/admin` | `CommandCenter` | Real snapshot RPC, incomplete/wrong KPI model |
| `/admin/users` | `UsersPage` | Active V2/V3 user data |
| `/admin/workspaces` | `UsersPage` | Confirmed routing bug; no workspace page |
| `/admin/orders` | `OrdersPage` | Server paging via V3; page-only CSV export |
| `/admin/intelligence` | `IntelligencePage` | Products/campaign capability view, incomplete global management |
| `/admin/operations` | `OperationsPageV2` | Health/audit/announcements generations overlap |
| `/admin/support` | `SupportPageV3` | Tickets work; support-mode authority is incomplete |
| `/admin/communications` | `CommunicationsPageV3` | Active V3 announcements |
| `/admin/platform` | `PlatformSettingsPageV3` | Active V3 settings RPCs |
| `/admin/ai-tools` | `AiToolsConsole` | Reuses two legacy Super Admin components |

### Canonical frontend data layer

`src/lib/founderAdmin.ts` is the best existing base. It wraps founder-only RPC families and should become the single Admin client. It currently mixes V1, V2 and V3 endpoints and must be normalized by capability rather than version suffix.

The active layout also calls global search and founder notifications through this layer. Seller dashboard data continues to use tenant-scoped Supabase queries and the shared auth context.

### Authorization

`src/lib/rbac.ts` and `FounderRoute` protect the active route with both:

- exact founder email `amineelaaouamecom@gmail.com`; and
- server-stored profile role `founder`.

This is stronger than trusting mutable client metadata, but it supports only one hardcoded founder and does not model scoped Platform Admin permissions. `isSuperAdmin` is now a deprecated founder alias.

The old `founder-internal-access` Edge Function hardcodes a different email, `ziadennachat5@gmail.com`, so it conflicts with active authorization. Its configuration disables gateway JWT verification and relies on manual validation inside the function. It must be retired or aligned only after callers are proven.

## Legacy generations

### Legacy Admin

- `src/pages/admin/*.tsx` outside `admin-pro`
- `src/components/AdminLayout.tsx`
- `src/components/AdminSidebar.tsx`
- `src/lib/admin.ts`

These are not routed by `App.tsx`. Some use direct browser access to privileged tables such as `platform_settings`, `subscription_plans`, `workspace_subscriptions` and `workspace_invoices`; they are not an acceptable authority for the rebuild.

### Legacy Super Admin

- `src/pages/super-admin/*`
- `src/components/SuperAdminLayout.tsx`
- `src/components/SuperAdminGuard.tsx`

The routes are retired. `ToolsApiProviders` and `LandingPageAiTemplates` are still imported by `AiToolsConsole`, so the entire directory cannot yet be deleted. Those two components must be moved behind the canonical Admin data layer before cleanup.

## Production schema and migration state

The linked project was inspected with Supabase CLI 2.115.0 using read-only commands.

### Migration ledger drift

- Remote history is broadly recorded through `054`, with a small number of later entries (`112`, `202608110001`, `202608110002`, `202608200000`, `202608200001`, `20260820150000`).
- Most local migrations from `056` onward are absent from the remote ledger.
- Production nevertheless contains later-generation tables including founder Admin, AI, subscription, TikTok, WhatsApp, notification and integration tables.
- Local versions are duplicated (`019`, `065`, `066`, `067`, `068`, `076`, `079`, `080`, `081`, `086`, `087`, `088`, `105`, `106`, `202608190005`).
- Two SQL utility files do not follow migration naming rules.

Conclusion: production changes were applied outside the recorded migration sequence. New work must use a unique timestamp migration and be defensive/idempotent. Migration history repair must be explicit; it must not mark unknown SQL as applied merely to silence the CLI.

A full schema dump was attempted but the installed CLI requires Docker for `pg_dump`, and Docker is unavailable. The read-only database inspector still confirmed live relation existence and approximate cardinality. No production data was modified.

The linked database linter then confirmed concrete live-schema failures:

- `workspaces.status` is absent although active Founder/Admin, support, notification and search functions reference it;
- older global-order functions reference `orders.id`, but the production key is the quoted `orders."Order ID"` column;
- old YouCan helpers reference a removed `youcan_credentials` relation;
- historical health/search functions reference obsolete Auth session columns and credential tables;
- inventory and integration helpers contain return-type, ambiguous-column and missing-constraint errors;
- reset/deletion functions reference tables/columns that no longer exist.

This proves that relation existence alone is not readiness. Broken functions must be replaced by canonical live-schema-aware RPCs; adding UI around them would only hide production failures.

### Core production relations confirmed

The live inspector confirmed, among others:

- tenancy: `profiles`, `workspaces`, `profile_workspaces`, `workspace_invitations`, `workspace_limits`;
- commerce: `orders`, `order_items`, `order_events`, `products`, `customers`, `shipments`, `expenses`, `ad_spend`, `meta_campaigns`;
- old billing: `subscription_plans`, `workspace_subscriptions`, `workspace_invoices`;
- Admin: `platform_settings`, `platform_audit_logs`, `founder_audit_events`, `founder_support_sessions`, `founder_account_controls`, `founder_user_notes`, `founder_announcements`, `founder_announcement_receipts`, `support_tickets`, `support_ticket_messages`;
- AI/tools: `ai_providers`, `ai_provider_health`, `ai_provider_usage`, `ai_usage_logs`, `ai_routing_config`, `tool_api_providers`, `tool_api_usage_logs`, generation/template tables;
- integrations/workers: WhatsApp queue/events/heartbeats, Google Sheets sync state/logs, TikTok connection/campaign/insight/event tables, shipping provider mappings/logs;
- observability remnants: `activity_logs`, `system_health_logs`, `error_logs`, `security_logs`, `api_usage_logs`.

The remote relation inventory does not prove column, policy, grant or function parity with local migrations. Those must be validated by narrowly scoped compatibility migrations and tests.

## RPC and database authority audit

Useful existing RPCs to preserve include:

- snapshots/search/notifications;
- V2 users, User 360, user notes and account state;
- V3 memberships/role editing/global orders;
- workspace support session creation/open/end;
- support tickets;
- V3 announcements;
- V3 platform settings;
- intelligence and AI provider administration.

### Release-blocking security findings

1. `founder_platform_audit_v3` is `SECURITY DEFINER` but does not call `is_founder()`. The migration grants callers of other founder functions but never revokes default execution on the audit helper. A browser role may be able to forge platform audit rows depending on live grants.
2. `founder_audit` has the same trust concern and must be reviewed live.
3. Founder functions use `SET search_path = public, auth`. Security-definer functions should use a pinned safe path and schema-qualified objects.
4. Function migrations commonly grant `authenticated` without first revoking `PUBLIC`/`anon`.
5. Several migrations create policies without an explicit target role. All tenant and Admin policies need a final RLS matrix and automated non-admin tests.
6. The active Admin Operations page directly reads `founder_audit_events` from the browser instead of using only its paged RPC.
7. Edge Functions with `verify_jwt = false` include founder internal access, multiple TikTok endpoints, WhatsApp endpoints, and notification endpoints. Webhook/callback endpoints may legitimately validate signatures manually; interactive endpoints require a per-function proof and fail-closed test.

## Support Mode audit

The current flow:

1. calls `founder_open_workspace_dashboard_v3` to create a founder support session;
2. stores the session identifier in `localStorage`;
3. calls `founder_open_support_dashboard` for target metadata;
4. calls `selectWorkspacePreview`, replacing the displayed workspace/profile in React;
5. continues using the founder's unchanged authentication token for seller queries.

The database validates the session only while opening the preview payload. It does not constrain subsequent seller-dashboard reads or writes. Since founder RLS bypass policies provide broad access, the displayed “Support Mode” is not read-only.

Required canonical design:

- server record with admin, target profile/workspace, reason, mode, created/expires/ended times and request metadata;
- a signed/opaque support-session token or explicit support session id passed to every support-mode RPC;
- read-only seller-dashboard RPCs that validate session, target and expiry for every request;
- explicit, time-limited write elevation with reason and audit event;
- no direct tenant table writes from Support Mode;
- persistent banner with mode and server-derived remaining time;
- expiry enforced by the database, not the timer.

Until that boundary exists, “Open Dashboard” must not be represented as secure read-only impersonation.

## Subscription and payment audit

### Current conflicting sources

- landing config: `src/config/pricing.ts`, official MAD Starter/Growth/Pro/Scale display;
- old database: Free/Starter/Pro/Enterprise, USD, workspace-level subscriptions/invoices;
- `workspaces.plan` used throughout tenant and Admin queries;
- signup trigger creates a Free pending-activation workspace subscription and workspace limit 1;
- `workspace_limits` stores partial capacity state;
- Admin platform overview still reads old plan/invoice tables.

### Required target

- one server-owned plan catalog with stable plan keys and MAD monthly/annual prices;
- one owner-level subscription account shared across owned workspaces;
- separate subscription period from usage reset period;
- payment requests, immutable price snapshots and private proof objects;
- atomic Admin payment approval plus subscription activation;
- effective subscription resolver combining base plan, status, custom limits, temporary overrides and entitlements;
- server-side capacity checks, including atomic order capacity;
- compatibility views/backfill for historical workspace billing records;
- landing and Admin plan displays reading the same server plan source.

No old billing table should be dropped until historical records are reconciled.

## KPI authority

`src/lib/metrics.ts` is the strongest existing definition and is used by the seller dashboard:

- canonical status prefers shipping status, then delivery status, then order status;
- delivered revenue = sum of order totals whose normalized status is `DELIVERED`;
- confirmed orders = normalized `CONFIRMED`, `OUT_FOR_DELIVERY`, `DELIVERED` or `COMING_BACK`;
- confirmation rate = confirmed orders / all orders;
- delivery rate = delivered orders / confirmed orders;
- CPA = ad spend / confirmed orders;
- ROAS = delivered revenue / ad spend;
- net profit = delivered revenue minus product cost, shipping cost, enabled operational fees and ad spend.

Problems to resolve:

- `founder_admin_snapshot` sums every order total created in the month, not delivered revenue;
- database status normalization and TypeScript normalization have evolved separately;
- `COMING_BACK` is counted as both confirmed and returned/cancelled, which should be explicitly accepted or revised with business tests;
- the shared engine declares `shippedCount` but does not increment it;
- Admin date boundaries use database/session timezone rather than `Africa/Casablanca` business boundaries;
- seller commerce GMV/revenue must remain separate from Ecom OS SaaS billing revenue.

The rebuild should expose one tested database analytics layer matching the canonical TypeScript fixtures, with explicit date-range/timezone parameters.

## Health, logs and operations

Current health RPCs are insufficient. They report a database recovery flag, counts of provider/ticket/usage rows and similar proxies. They do not actively validate service availability or freshness.

The canonical health model needs timestamped checks with provenance and `unknown` when unmeasured:

- Database, Auth, Realtime and Storage;
- Edge Function invocation/failure rate;
- webhook receipt/signature/processing state;
- WhatsApp, notification and sync worker heartbeats/backlogs;
- shipping, store, ad and AI providers;
- grouped application errors with correlation ids.

Historical `system_health_logs`, `error_logs`, `security_logs` and `api_usage_logs` exist but are not yet proven to be populated. Empty tables must not produce green cards.

## Seller ownership and membership

`profile_workspaces` is the canonical many-to-many membership relation and newer migrations add role/status. `profiles.workspace_id` and role fields remain legacy shortcuts. Ownership must be derived from active membership (`is_owner`/membership role) and every count must use distinct active members.

Platform role and workspace role are currently mixed. The target must separate:

- platform roles/permissions for `/admin`;
- workspace membership roles/sections for seller operations;
- immutable root-founder protection.

## Implementation sequence

1. Create a unique, defensive security/authorization migration that fixes audit execution, introduces canonical platform Admin permissions, and adds server-enforced support session primitives.
2. Consolidate the Admin client and route map; add dedicated Sellers and Workspaces pages before adding new verticals.
3. Add server-paged Seller 360, Workspaces, Products and Campaigns RPCs with canonical KPI formulas and Casablanca date bounds.
4. Introduce owner-level plan, subscription, payment and effective-limit tables/resolvers with compatibility/backfill from legacy billing.
5. Enforce capacity and entitlements in database/worker ingestion paths.
6. Complete account actions via trusted server paths for Auth ban/delete/session revocation; never simulate them in the browser.
7. Rebuild Support Mode on its server boundary, then expose Open Dashboard from all required contexts.
8. Complete health/log/error/security surfaces using recorded checks and correlation ids.
9. Add RLS, root-protection, account-action, support-session, KPI, subscription/payment and end-to-end tests.
10. Remove legacy Admin code only after import and route proofs show zero active callers.

## Verification gates

- `npm run typecheck`
- existing unit suites
- production build
- migration lint/dry-run against a disposable or shadow database
- authenticated founder and non-founder RPC tests
- RLS matrix for anonymous, seller member, workspace owner, Platform Admin and root founder
- account action and root protection tests
- support read-only/write-elevation/expiry tests
- KPI fixture parity between seller and Admin
- payment approval transaction/duplicate submission tests
- browser route, responsive and accessibility checks

The linked production database must not receive mutations until migration history drift and live function/policy compatibility are reconciled.
