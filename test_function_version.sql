-- Create a test function to check if our fix is applied
create or replace function public.test_invitation_function_version()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  function_source text;
  has_array_fix boolean;
  has_trigger_fix boolean;
  has_subscription_check boolean;
begin
  -- Get the function source
  select prosrc into function_source
  from pg_proc
  where proname = 'accept_workspace_invitation'
    and pronamespace = (select oid from pg_namespace where nspname = 'public');
  
  has_array_fix := function_source LIKE '%ARRAY[]::text[]%';
  has_trigger_fix := function_source LIKE '%drop trigger if exists trg_prevent_self_profile_changes%';
  has_subscription_check := function_source LIKE '%workspace_subscription_owners%';
  
  return jsonb_build_object(
    'has_array_fix', has_array_fix,
    'has_trigger_fix', has_trigger_fix,
    'has_subscription_check', has_subscription_check,
    'function_source_length', length(function_source)
  );
end;
$$;

revoke all on function public.test_invitation_function_version() from public, anon;
grant execute on function public.test_invitation_function_version() to authenticated;
