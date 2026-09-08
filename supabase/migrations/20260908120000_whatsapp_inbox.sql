-- Production WhatsApp inbox extensions. The existing contacts/messages tables
-- remain the source of truth for automation history; this adds only inbox
-- metadata and a trigger-maintained conversation summary.

create table if not exists public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  first_contacted_at timestamptz not null default now(),
  unique (phone_number, workspace_id)
);

alter table public.whatsapp_contacts
  add column if not exists remote_jid text,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists order_id uuid,
  add column if not exists assigned_agent_id uuid references public.profiles(id) on delete set null,
  add column if not exists unread_count integer not null default 0,
  add column if not exists last_message text,
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_direction text,
  add column if not exists ai_enabled boolean not null default true,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.whatsapp_messages
  add column if not exists conversation_id uuid references public.whatsapp_contacts(id) on delete set null,
  add column if not exists media_url text,
  add column if not exists reply_to_message_id uuid references public.whatsapp_messages(id) on delete set null,
  add column if not exists sent_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists error_message text;

create index if not exists whatsapp_contacts_workspace_inbox_idx
  on public.whatsapp_contacts (workspace_id, archived_at, last_message_at desc nulls last);
create index if not exists whatsapp_contacts_assignment_idx
  on public.whatsapp_contacts (workspace_id, assigned_agent_id, unread_count);
create index if not exists whatsapp_messages_conversation_idx
  on public.whatsapp_messages (workspace_id, conversation_id, created_at asc);

alter table public.whatsapp_contacts enable row level security;
drop policy if exists whatsapp_contacts_read on public.whatsapp_contacts;
create policy whatsapp_contacts_read on public.whatsapp_contacts
  for select to authenticated
  using (workspace_id = public.get_my_workspace_id());
drop policy if exists whatsapp_contacts_update on public.whatsapp_contacts;
create policy whatsapp_contacts_update on public.whatsapp_contacts
  for update to authenticated
  using (workspace_id = public.get_my_workspace_id())
  with check (workspace_id = public.get_my_workspace_id());
drop policy if exists whatsapp_contacts_insert on public.whatsapp_contacts;
create policy whatsapp_contacts_insert on public.whatsapp_contacts
  for insert to authenticated
  with check (workspace_id = public.get_my_workspace_id());

create or replace function public.sync_whatsapp_inbox_contact()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := coalesce(nullif(new.normalized_phone, ''), nullif(new.phone, ''));
  v_contact_id uuid;
begin
  if v_phone is null or btrim(v_phone) = '' then return new; end if;

  insert into public.whatsapp_contacts (
    workspace_id, phone_number, remote_jid, customer_id, order_id,
    unread_count, last_message, last_message_at, last_message_direction,
    updated_at
  ) values (
    new.workspace_id, v_phone, new.remote_jid, new.customer_id, new.order_id,
    case when new.direction = 'inbound' then 1 else 0 end,
    left(coalesce(new.body, ''), 4000), coalesce(new.created_at, now()),
    new.direction, now()
  )
  on conflict (phone_number, workspace_id) do update set
    remote_jid = coalesce(excluded.remote_jid, public.whatsapp_contacts.remote_jid),
    customer_id = coalesce(excluded.customer_id, public.whatsapp_contacts.customer_id),
    order_id = coalesce(excluded.order_id, public.whatsapp_contacts.order_id),
    unread_count = public.whatsapp_contacts.unread_count +
      case when excluded.last_message_direction = 'inbound' then 1 else 0 end,
    last_message = excluded.last_message,
    last_message_at = excluded.last_message_at,
    last_message_direction = excluded.last_message_direction,
    updated_at = now()
  returning id into v_contact_id;

  update public.whatsapp_messages
  set conversation_id = v_contact_id
  where id = new.id and conversation_id is null;
  return new;
end;
$$;

drop trigger if exists whatsapp_message_sync_inbox_contact on public.whatsapp_messages;
create trigger whatsapp_message_sync_inbox_contact
  after insert on public.whatsapp_messages
  for each row execute function public.sync_whatsapp_inbox_contact();

revoke all on function public.sync_whatsapp_inbox_contact() from public, anon, authenticated;
grant execute on function public.sync_whatsapp_inbox_contact() to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
      where p.pubname = 'supabase_realtime' and c.relname = 'whatsapp_contacts'
    ) then alter publication supabase_realtime add table public.whatsapp_contacts; end if;
    if not exists (
      select 1 from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
      where p.pubname = 'supabase_realtime' and c.relname = 'whatsapp_messages'
    ) then alter publication supabase_realtime add table public.whatsapp_messages; end if;
  end if;
end;
$$;

-- Backfill summaries once, without changing historical message rows.
insert into public.whatsapp_contacts (workspace_id, phone_number, remote_jid,
  customer_id, order_id, unread_count, last_message, last_message_at,
  last_message_direction, updated_at)
select distinct on (m.workspace_id, coalesce(nullif(m.normalized_phone, ''), m.phone))
  m.workspace_id,
  coalesce(nullif(m.normalized_phone, ''), m.phone),
  m.remote_jid,
  m.customer_id,
  m.order_id,
  0,
  left(coalesce(m.body, ''), 4000),
  m.created_at,
  m.direction,
  now()
from public.whatsapp_messages m
where coalesce(nullif(m.normalized_phone, ''), m.phone) is not null
order by m.workspace_id,
  coalesce(nullif(m.normalized_phone, ''), m.phone), m.created_at desc nulls last
on conflict (phone_number, workspace_id) do update set
  remote_jid = coalesce(excluded.remote_jid, public.whatsapp_contacts.remote_jid),
  customer_id = coalesce(excluded.customer_id, public.whatsapp_contacts.customer_id),
  order_id = coalesce(excluded.order_id, public.whatsapp_contacts.order_id),
  last_message = excluded.last_message,
  last_message_at = excluded.last_message_at,
  last_message_direction = excluded.last_message_direction,
  updated_at = now();

update public.whatsapp_messages m
set conversation_id = c.id
from public.whatsapp_contacts c
where m.conversation_id is null
  and c.workspace_id = m.workspace_id
  and c.phone_number = coalesce(nullif(m.normalized_phone, ''), m.phone);
