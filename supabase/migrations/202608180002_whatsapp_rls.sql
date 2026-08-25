-- MIGRATION: 202608180002_whatsapp_rls

-- Enable RLS for all WhatsApp tables
alter table public.whatsapp_settings enable row level security;
alter table public.whatsapp_queue enable row level security;
alter table public.whatsapp_messages enable row level security;

-- Policies for whatsapp_settings
create policy "Users can read own workspace whatsapp settings" 
  on public.whatsapp_settings for select 
  using (workspace_id = public.get_my_workspace_id());

create policy "Users can update own workspace whatsapp settings" 
  on public.whatsapp_settings for update 
  using (
    workspace_id = public.get_my_workspace_id() 
    and ((select role from profiles where id = auth.uid()) in ('owner', 'supervisor', 'admin', 'founder', 'super_admin'))
  );

create policy "Users can insert own workspace whatsapp settings" 
  on public.whatsapp_settings for insert 
  with check (
    workspace_id = public.get_my_workspace_id() 
    and ((select role from profiles where id = auth.uid()) in ('owner', 'supervisor', 'admin', 'founder', 'super_admin'))
  );

-- Policies for whatsapp_queue
create policy "Users can read own workspace whatsapp queue" 
  on public.whatsapp_queue for select 
  using (workspace_id = public.get_my_workspace_id());

create policy "Users can insert own workspace whatsapp queue" 
  on public.whatsapp_queue for insert 
  with check (workspace_id = public.get_my_workspace_id());

create policy "Users can update own workspace whatsapp queue" 
  on public.whatsapp_queue for update 
  using (workspace_id = public.get_my_workspace_id());

create policy "Users can delete own workspace whatsapp queue" 
  on public.whatsapp_queue for delete 
  using (workspace_id = public.get_my_workspace_id());

-- Policies for whatsapp_messages
create policy "Users can read own workspace whatsapp messages" 
  on public.whatsapp_messages for select 
  using (workspace_id = public.get_my_workspace_id());

create policy "Users can insert own workspace whatsapp messages" 
  on public.whatsapp_messages for insert 
  with check (workspace_id = public.get_my_workspace_id());

create policy "Users can update own workspace whatsapp messages" 
  on public.whatsapp_messages for update 
  using (workspace_id = public.get_my_workspace_id());

create policy "Users can delete own workspace whatsapp messages" 
  on public.whatsapp_messages for delete 
  using (workspace_id = public.get_my_workspace_id());
