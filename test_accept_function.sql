-- Create a simplified test function to isolate the RLS issue
create or replace function public.test_accept_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.workspace_invitations%rowtype;
  current_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  result jsonb;
begin
  -- Just try to read the invitation without any RLS-protected tables
  select * into invitation_row
  from public.workspace_invitations
  where id = p_invitation_id
  for update;

  if not found then 
    return jsonb_build_object('success', false, 'error', 'INVITATION_NOT_FOUND');
  end if;
  
  if lower(invitation_row.email) <> current_email then 
    return jsonb_build_object('success', false, 'error', 'INVITATION_EMAIL_MISMATCH', 'invitation_email', invitation_row.email, 'current_email', current_email);
  end if;

  -- If we get here, the basic checks passed
  return jsonb_build_object('success', true, 'invitation_id', invitation_row.id, 'workspace_id', invitation_row.workspace_id, 'email', invitation_row.email);
end;
$$;

revoke all on function public.test_accept_invitation(uuid) from public, anon;
grant execute on function public.test_accept_invitation(uuid) to authenticated;
