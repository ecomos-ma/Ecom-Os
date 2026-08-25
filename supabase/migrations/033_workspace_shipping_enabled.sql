-- Migration 033: add shipping_enabled to workspaces and restrict update policy to owners/supervisors
-- Adds a workspace-scoped feature flag to enable/disable the Shipping module per workspace.

alter table if exists public.workspaces
  add column if not exists shipping_enabled boolean not null default true;

-- Ensure existing rows default to true (ADD COLUMN with DEFAULT sets existing rows)

-- Reinforce RLS: only owners or supervisors may update their workspace
drop policy if exists "Users can update own workspace" on public.workspaces;
create policy "Users can update own workspace"
  on public.workspaces for update using (
    id = public.get_my_workspace_id() and (
      (select role from public.profiles where id = auth.uid()) in ('owner', 'supervisor')
    )
  );

grant select on public.workspaces to authenticated;
