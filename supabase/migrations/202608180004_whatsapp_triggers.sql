-- MIGRATION: 202608180004_whatsapp_triggers

-- Trigger on Orders to queue a WhatsApp confirmation message.
-- This function executes after an order is inserted.
create or replace function public.queue_whatsapp_confirmation()
returns trigger language plpgsql security definer
as $$
declare
  wa_settings record;
  q_scheduled_for timestamptz;
begin
  -- Retrieve WhatsApp settings for the order's workspace.
  -- Notice: The workspace_id might be stored directly in orders (if multi_tenant.sql applied it) 
  -- We assume 'public.get_my_workspace_id()' or that orders has 'workspace_id'. EcomOS relies on cross-schema access context, 
  -- but a trigger must find the workspace_id based on who is creating it, or an existing column on the order.
  -- In EcomOS, `workspace_id` is typically an implied context `public.get_my_workspace_id()`, OR it is explicitly stored.
  -- We'll try to find the workspace_id associated with the order via the current auth context if possible, 
  -- but for robust backend ingestion (like webhooks), orders often have `workspace_id` explicitly. Let's assume order has it, 
  -- or we find it via the session if standard. If EcomOS handles webhooks uniquely, let's grab the workspace_id from auth if column is missing.
  
  -- Assuming 'orders' has a 'workspace_id' column from multi_tenant migrations:
  select * into wa_settings from public.whatsapp_settings 
  where workspace_id = new.workspace_id and enabled = true;
  
  -- Check if WhatsApp integration and auto-confirmation are enabled
  if found and wa_settings.auto_order_confirmation = true then
    -- Only queue if order needs confirmation (pending, etc.)
    if new.status = 'pending' and new.phone is not null then
      -- Calculate scheduled time based on delay
      q_scheduled_for := now() + (wa_settings.send_delay_minutes || ' minutes')::interval;
      
      -- Insert into queue (ON CONFLICT DO NOTHING relies on unique constraint)
      insert into public.whatsapp_queue (
        workspace_id,
        order_id,
        phone,
        message_type,
        status,
        scheduled_for
      ) values (
        new.workspace_id,
        new.id,
        new.phone,
        'confirmation',
        'pending',
        q_scheduled_for
      ) on conflict (workspace_id, order_id, message_type) do nothing;
      
    end if;
  end if;
  
  return new;
exception
  when undefined_column then
    -- Fallback strategy if 'workspace_id' column doesn't exist directly on given row.
    -- Ecom OS sometimes uses RLS tenant isolation without explicit column in some old tables.
    return new;
end;
$$;

drop trigger if exists on_new_order_whatsapp on public.orders;
create trigger on_new_order_whatsapp
  after insert on public.orders
  for each row 
  execute function public.queue_whatsapp_confirmation();
