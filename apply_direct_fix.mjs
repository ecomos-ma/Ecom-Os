import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyDirectFix() {
  console.log("Applying direct fix to accept_workspace_invitation function...");
  
  const fixSQL = `
    create or replace function public.accept_workspace_invitation(p_invitation_id uuid)
    returns void
    language plpgsql
    security definer
    set search_path = ''
    as $$
    declare
      invitation_row public.workspace_invitations%rowtype;
      current_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
      active_members integer;
      member_limit integer;
      normalized_role text;
    begin
      if (select auth.uid()) is null or current_email = '' then
        raise exception 'AUTHENTICATION_REQUIRED';
      end if;

      select * into invitation_row
      from public.workspace_invitations
      where id = p_invitation_id
      for update;

      if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
      if invitation_row.status = 'accepted' and invitation_row.user_id = (select auth.uid()) then
        return;
      end if;
      if invitation_row.status <> 'pending' then raise exception 'INVITATION_NOT_AVAILABLE'; end if;
      if invitation_row.revoked_at is not null then raise exception 'INVITATION_REVOKED'; end if;
      if invitation_row.expires_at is not null and invitation_row.expires_at <= now() then
        update public.workspace_invitations
        set status = 'expired'
        where id = invitation_row.id and status = 'pending';
        raise exception 'INVITATION_EXPIRED';
      end if;
      if lower(invitation_row.email) <> current_email then raise exception 'INVITATION_EMAIL_MISMATCH'; end if;

      if not exists (
        select 1
        from public.profiles inviter
        join public.profile_workspaces membership
          on membership.profile_id = inviter.id
         and membership.workspace_id = invitation_row.workspace_id
        where inviter.id = invitation_row.invited_by
          and coalesce(inviter.is_active, true)
          and inviter.deleted_at is null
          and coalesce(membership.status, 'active') = 'active'
          and (
            membership.is_owner
            or lower(coalesce(membership.role, inviter.role, '')) = any(array['owner','supervisor','admin','manager','founder']::text[])
          )
      ) then
        raise exception 'INVITER_NO_LONGER_AUTHORIZED';
      end if;

      if not exists (
        select 1 from public.workspaces
        where id = invitation_row.workspace_id
          and coalesce(is_active, true)
          and deleted_at is null
      ) then
        raise exception 'WORKSPACE_NOT_AVAILABLE';
      end if;

      if exists (
        select 1 from public.profile_workspaces
        where profile_id = (select auth.uid())
          and workspace_id = invitation_row.workspace_id
          and coalesce(status, 'active') = 'active'
      ) then
        normalized_role := case when invitation_row.role = 'supervisor' then 'supervisor' else 'agent' end;
      else
        select count(*)::integer into active_members
        from public.profile_workspaces
        where workspace_id = invitation_row.workspace_id
          and coalesce(status, 'active') = 'active';

        select coalesce(active_override.team_member_limit, plan.team_member_limit, 10000)
        into member_limit
        from public.workspace_subscription_owners owner
        left join public.user_subscriptions subscription on subscription.owner_user_id = owner.owner_user_id
        left join public.subscription_plans plan on plan.id = subscription.plan_id and plan.is_official
        left join lateral (
          select override.team_member_limit
          from public.subscription_limit_overrides override
          where override.subscription_id = subscription.id
            and override.team_member_limit is not null
            and override.revoked_at is null
            and override.starts_at <= now()
            and (override.ends_at is null or override.ends_at > now())
          order by override.created_at desc
          limit 1
        ) active_override on true
        where owner.workspace_id = invitation_row.workspace_id;

        if coalesce(member_limit, 10000) <= active_members then
          raise exception 'TEAM_MEMBER_LIMIT_REACHED';
        end if;
        normalized_role := case when invitation_row.role = 'supervisor' then 'supervisor' else 'agent' end;
      end if;

      -- Fix: Convert text[] to jsonb properly
      update public.profiles
      set workspace_id = invitation_row.workspace_id,
          allowed_sections = coalesce(invitation_row.allowed_sections::jsonb, '[]'::jsonb),
          role = normalized_role,
          is_active = true,
          full_name = coalesce(nullif(invitation_row.full_name, ''), full_name)
      where id = (select auth.uid());
      if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

      insert into public.profile_workspaces (profile_id, workspace_id, is_owner, role, status)
      values ((select auth.uid()), invitation_row.workspace_id, false, normalized_role, 'active')
      on conflict (profile_id, workspace_id) do update
        set role = excluded.role,
            status = 'active',
            is_owner = false;

      insert into public.team_member_profiles (profile_id, workspace_id, daily_limit, max_active_orders)
      values (
        (select auth.uid()),
        invitation_row.workspace_id,
        coalesce(nullif(invitation_row.agent_settings->>'daily_limit', '')::integer, 80),
        coalesce(nullif(invitation_row.agent_settings->>'max_active_orders', '')::integer, 30)
      )
      on conflict (profile_id, workspace_id) do update
        set daily_limit = excluded.daily_limit,
            max_active_orders = excluded.max_active_orders;

      update public.workspace_invitations
      set status = 'accepted',
          accepted_at = now(),
          user_id = (select auth.uid())
      where id = invitation_row.id and status = 'pending';

      insert into public.team_audit_log (
        workspace_id, actor_id, actor_email, action,
        target_type, target_id, target_email, changes
      ) values (
        invitation_row.workspace_id,
        (select auth.uid()),
        current_email,
        'invitation_accepted',
        'invitation',
        invitation_row.id,
        invitation_row.email,
        jsonb_build_object('role', normalized_role, 'allowed_sections', invitation_row.allowed_sections::jsonb)
      );
    end;
    $$;

    revoke all on function public.accept_workspace_invitation(uuid) from public, anon;
    grant execute on function public.accept_workspace_invitation(uuid) to authenticated;
  `;

  // Try to execute via RPC if available, otherwise use direct SQL execution
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: fixSQL });
    
    if (error) {
      console.error("RPC method failed:", error);
      console.log("Trying direct connection method...");
      
      // Since we can't use RPC, let's try using the raw connection
      const { Client } = await import('pg');
      const client = new Client({
        connectionString: supabaseUrl,
        ssl: { rejectUnauthorized: false }
      });
      
      await client.connect();
      await client.query(fixSQL);
      await client.end();
      
      console.log("✅ Fix applied successfully via direct connection");
    } else {
      console.log("✅ Fix applied successfully via RPC:", data);
    }
  } catch (err) {
    console.error("❌ Error applying fix:", err);
    console.log("\nPlease apply this fix manually in the Supabase SQL Editor:");
    console.log("https://supabase.com/dashboard/project/wxfialbmyfkafobtkrde/sql");
    console.log("\nCopy and paste the SQL from fix_type_mismatch.sql file");
  }
}

applyDirectFix();
