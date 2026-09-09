-- Remove legacy browser policies from server-only YouCan state.
-- service_role continues to bypass RLS and retains explicit table grants.

drop policy if exists "Service role can manage youcan counters" on public.youcan_order_counters;
drop policy if exists "Workspace isolation for youcan_order_counters" on public.youcan_order_counters;
drop policy if exists "No direct access" on public.youcan_tokens;
drop policy if exists "Service role only" on public.youcan_tokens;
drop policy if exists "Workspace isolation for youcan_tokens" on public.youcan_tokens;

drop index if exists public.orders_workspace_youcan_order_id_idx;
