# Ecom OS Admin Control Center — safe SQL installation order

Use a **new Supabase SQL Editor query for every step**. Open the linked file,
copy the **whole file** (`Ctrl+A`, `Ctrl+C`), paste it, and run it once. Never
highlight or run only a `DO $$`, `AS $$`, CTE, or function fragment.

1. Read-only preflight: `docs/admin-sql/00_preflight_read_only.sql`
2. Canonical authorization and admin foundation: `supabase/migrations/20260826095226_canonical_admin_authorization.sql`
3. Official owner subscriptions and payments: `supabase/migrations/20260826101907_official_owner_subscriptions.sql`
4. Expiring Support Mode RLS: `supabase/migrations/20260826103929_harden_support_mode_tenant_access.sql`
5. Sellers, products, and campaigns services: `supabase/migrations/20260826104134_canonical_admin_business_data.sql`
6. Auth account controls and User 360: `supabase/migrations/20260826104926_platform_auth_admin_controls.sql`
7. Read-only verification: `docs/admin-sql/06_verify_installation.sql`

Each changing SQL file starts with `begin;` and ends with `commit;`. If any
step reports an error, stop on that step and do not run later files. A failed
transaction does not require deleting tables or data; rerun the corrected
whole file.

The Edge Function `platform-account-admin` must be deployed after the SQL
steps so Auth ban, unban, forced logout, and hard deletion can use GoTrue Admin
without exposing the service-role key to the browser.
