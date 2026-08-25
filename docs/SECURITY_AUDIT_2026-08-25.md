# Ecom OS Security Audit — 2026-08-25

## Scope and evidence

This audit covers the React/Vite client, 55 local Supabase Edge Function directories, 148 local migration files, the `whatsapp-web.js` worker, and the linked Supabase project's REST metadata and database lint output. The live REST schema exposes 182 table/view/RPC definitions.

The worktree already contained extensive uncommitted and untracked work before this audit. Changes in this repair set are intentionally limited to the files listed under **Implemented repairs**.

## Critical findings

### C-01 — Users could mutate their own tenant membership and role

Historical migrations grant `authenticated` direct `INSERT`, `UPDATE`, and `DELETE` privileges on `profile_workspaces`. The active policy permits all mutations when `profile_id = auth.uid()`. Because the row contains `workspace_id`, `role`, and `is_owner`, a browser client could attempt self-promotion or membership manipulation directly through PostgREST.

Affected evidence:

- `supabase/migrations/022_workspace_limits_profile_workspaces_rls_fix.sql`
- `supabase/migrations/018_fix_workspace_rls_and_data.sql`
- Live `profile_workspaces` columns include `role` and `is_owner`.

Repair: `20260825050000_harden_tenant_membership.sql` removes every mutation policy, revokes browser mutation privileges, adds explicit membership status, and leaves only an active-workspace read policy.

### C-02 — Unauthenticated YouCan order-debug IDOR exposed raw customer data

`debug-youcan-order` accepted a caller-supplied `workspace_id`, used the service-role client, fetched that workspace's YouCan token, and returned the complete upstream order payload. It did not authenticate the caller or verify workspace membership.

Repair: JWT authentication, active membership and owner/admin/manager authorization, strict input keys, UUID/order-ID validation, restricted CORS, request timeout, generic upstream errors, and a minimal response with no raw provider payload.

### C-03 — YouCan repair endpoint crossed workspace boundaries and logged credentials/PII

`fix-youcan-orders` trusted a caller-supplied workspace, then queried all YouCan orders without a workspace filter and updated by `order_number` without a workspace predicate. It logged the first 50 characters of the OAuth access token and portions of raw provider/customer payloads.

Repair: JWT and workspace-admin authorization, strict input validation, workspace-scoped reads and writes, bounded pagination, no token/PII logs, generic errors, and count-only output.

## High findings

### H-01 — Public maintenance endpoint could alter Realtime publication

`enable-orders-realtime` had no authentication and used a service-role client to invoke an ad-hoc `exec_sql` RPC. Realtime publication changes are schema operations and should never be exposed as a public HTTP action.

Repair: endpoint is inert and returns HTTP 410. The migration revokes all `exec_sql` overloads from `public`, `anon`, and `authenticated` if such functions exist.

### H-02 — Any workspace member could disconnect integrations

`disconnect-integration` checked membership but not an integration-management role. It also ignored disconnect RPC failures and still returned success.

Repair: owner/admin authorization, provider allowlist, strict request schema, restricted CORS, explicit RPC error handling, generic errors, and audit-write failure redaction.

### H-03 — Live database functions are out of sync with the live schema

Read-only `supabase db lint --linked` reported errors in production functions including:

- `reset_workspace`
- `api_return_parcel_to_stock`
- `create_user_notification`
- `get_admin_platform_metrics`
- `admin_search`
- founder order/search functions
- YouCan activation/deactivation helpers
- workspace deletion preview/execution
- shipment claim/sync
- Google Sheets and shipping integration helpers
- `add_whatsapp_queue`

Several errors reference missing columns/tables; others have incompatible return types or invalid `ON CONFLICT` targets. These failures can cause authorization-safe workflows to fail open at the UI layer, falsely report success, or leave integrations/jobs running.

### H-04 — Local migration history is not reconciled with production

`supabase db push --linked --dry-run` reports roughly one hundred local migrations that predate the latest remote migration but are absent from remote migration history. A normal push is unsafe and was not executed.

Required remediation: reconcile migration history against a verified schema snapshot or a disposable branch, then validate and apply only reviewed forward migrations.

## Medium findings

- Many legacy Edge Functions use `Access-Control-Allow-Origin: *`. CORS is not authorization, but wildcard origins increase exposure and complicate browser-origin controls.
- Several functions use service-role clients. Each must independently authenticate and authorize before tenant reads/writes; the remaining functions require endpoint-by-endpoint verification.
- `founder-internal-access` grants cross-workspace read access based on a hard-coded founder email. It validates the JWT, but support access should use expiring, reason-bound, audited sessions everywhere.
- `webhook_logs` has no first-class `workspace_id`; workspace identity is embedded in payloads. Existing records cannot be safely backfilled without provenance verification.
- `whatsapp-worker.zip` is an untracked 121 MB deployment artifact. Existing project documentation states it contains a service-role environment file and a live browser session. It must not be deployed or shared; associated secrets/session should be rotated through an owner-approved procedure.

## Implemented repairs

- `supabase/migrations/20260825050000_harden_tenant_membership.sql`
- `supabase/tests/tenant_membership_hardening.test.sql`
- `supabase/functions/_shared/security.ts`
- `supabase/functions/debug-youcan-order/index.ts`
- `supabase/functions/fix-youcan-orders/index.ts`
- `supabase/functions/enable-orders-realtime/index.ts`
- `supabase/functions/disconnect-integration/index.ts`
- `supabase/config.toml`

## Verification completed

- Production React build: passed.
- TikTok tests: 11 passed.
- WhatsApp worker tests: 5 passed.
- Repaired Edge Functions: Deno type-check passed.
- Production dependency audit: 0 known production vulnerabilities reported.
- Supabase live database lint: completed read-only; existing schema errors documented above.
- Migration comparison: completed in dry-run mode; no database migration was applied.

## Deployment status and safety gate

The security migration and repaired functions are not deployed yet. Deploying functions before the membership migration would fail because the functions intentionally require the new `profile_workspaces.status` column. A normal `supabase db push` is unsafe due to unreconciled historical migrations.

Safe deployment requires one of:

1. Validate the migration on a disposable Supabase branch, then apply the single reviewed SQL file and deploy the four repaired functions; or
2. Run the single migration in the Supabase SQL editor inside a reviewed maintenance window, run the pgTAP test, then deploy the functions.

## Remaining audit phases

- Live table-by-table RLS and grant inventory for all 182 exposed definitions.
- Storage bucket and object-policy isolation tests.
- Realtime cross-workspace subscription tests.
- Webhook signature/replay/idempotency verification per provider.
- Edge Function authorization review for the remaining functions.
- Two-user/two-workspace negative integration tests.
- Support-mode and invitation lifecycle tests.
- Secret rotation and removal of unsafe deployment artifacts.
