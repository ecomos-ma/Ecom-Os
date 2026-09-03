-- Execute every independently validated WhatsApp-AI action in one inbound
-- message. The existing single-action RPC remains the canonical validator for
-- order/status/variant/callback actions; this wrapper adds customer fields and
-- batches all results without allowing one failed field to block another.

create or replace function public.execute_whatsapp_ai_actions(
  p_workspace_id uuid,
  p_order_id uuid,
  p_provider_event_id text,
  p_inbound_message_id uuid,
  p_decision jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_settings public.whatsapp_ai_settings%rowtype;
  v_order public.orders%rowtype;
  v_action jsonb;
  v_index integer;
  v_type text;
  v_intent text;
  v_params jsonb;
  v_event_id text;
  v_single_decision jsonb;
  v_single_result jsonb;
  v_action_id uuid;
  v_permission text;
  v_confidence numeric := 0;
  v_name text;
  v_city text;
  v_note text;
  v_old jsonb;
  v_new jsonb;
  v_field text;
  v_summary text;
  v_changes jsonb := '[]'::jsonb;
  v_action_changes jsonb := '[]'::jsonb;
  v_results jsonb := '[]'::jsonb;
  v_any_applied boolean := false;
  v_author_id uuid;
begin
  if nullif(btrim(p_provider_event_id), '') is null then
    return jsonb_build_object('applied', false, 'action', 'multi_action', 'reply_text', 'I could not safely understand that message.');
  end if;

  -- Keep legacy one-action responses compatible with existing queued jobs.
  if jsonb_typeof(p_decision -> 'actions') is distinct from 'array' then
    return public.execute_whatsapp_ai_action(p_workspace_id, p_order_id, p_provider_event_id, p_inbound_message_id, p_decision);
  end if;
  if jsonb_array_length(p_decision -> 'actions') = 0 or jsonb_array_length(p_decision -> 'actions') > 8 then
    return jsonb_build_object('applied', false, 'action', 'multi_action', 'reply_text', 'ممكن توضح ليا أكثر من فضلك؟');
  end if;

  select * into v_settings
  from public.whatsapp_ai_settings
  where workspace_id = p_workspace_id and enabled = true;
  if not found then return jsonb_build_object('applied', false, 'ai_disabled', true); end if;

  begin v_confidence := coalesce((p_decision ->> 'confidence')::numeric, 0); exception when others then v_confidence := 0; end;

  for v_index, v_action in
    select ordinal::integer, value
    from jsonb_array_elements(p_decision -> 'actions') with ordinality as actions(value, ordinal)
  loop
    v_type := lower(btrim(coalesce(v_action ->> 'type', '')));
    v_params := coalesce(v_action -> 'parameters', '{}'::jsonb);
    v_event_id := p_provider_event_id || ':' || v_index::text;
    v_single_result := null;
    v_action_changes := '[]'::jsonb;

    begin
      if v_type not in (
        'confirm_order', 'change_customer_name', 'change_city', 'change_address',
        'change_variant', 'change_color', 'change_size', 'change_quantity',
        'set_callback', 'add_order_note', 'add_customer_note', 'cancel_order', 'question'
      ) then
        v_results := v_results || jsonb_build_array(jsonb_build_object('type', v_type, 'applied', false, 'reason', 'unsupported_action'));
        continue;
      end if;

      -- Customer name, city and customer notes have real order/customer fields
      -- but were not part of the original single-action executor.
      if v_type in ('change_customer_name', 'change_city', 'add_customer_note') then
        select * into v_order from public.orders
        where workspace_id = p_workspace_id and "Order ID" = p_order_id
        for update;
        if not found then
          v_results := v_results || jsonb_build_array(jsonb_build_object('type', v_type, 'applied', false, 'reason', 'order_not_found'));
          continue;
        end if;

        v_permission := case when v_type in ('change_customer_name', 'change_city') then 'change_address' else 'add_note' end;
        insert into public.whatsapp_ai_actions(workspace_id, order_id, provider_event_id, inbound_message_id, intent, decision)
        values (p_workspace_id, p_order_id, v_event_id, p_inbound_message_id, v_type, v_action)
        on conflict (workspace_id, provider_event_id) do nothing
        returning id into v_action_id;
        if v_action_id is null then
          v_results := v_results || jsonb_build_array(jsonb_build_object('type', v_type, 'applied', false, 'duplicate', true));
          continue;
        end if;

        if v_confidence < 0.72 or coalesce((v_settings.permissions ->> v_permission)::boolean, false) is not true then
          update public.whatsapp_ai_actions
          set status = case when v_confidence < 0.72 then 'clarification' else 'rejected' end,
              result = jsonb_build_object('permission', v_permission), completed_at = now()
          where id = v_action_id;
          v_results := v_results || jsonb_build_array(jsonb_build_object('type', v_type, 'applied', false, 'reason', case when v_confidence < 0.72 then 'low_confidence' else 'permission_denied' end));
          continue;
        end if;

        if v_type = 'change_customer_name' then
          v_name := btrim(coalesce(v_params ->> 'name', ''));
          if char_length(v_name) < 2 or char_length(v_name) > 120 then
            update public.whatsapp_ai_actions set status = 'clarification', result = jsonb_build_object('reason', 'invalid_name'), completed_at = now() where id = v_action_id;
            v_results := v_results || jsonb_build_array(jsonb_build_object('type', v_type, 'applied', false, 'reason', 'invalid_name'));
            continue;
          end if;
          v_field := 'customer_name'; v_old := to_jsonb(v_order.customer_name); v_new := to_jsonb(v_name); v_summary := 'Customer name changed via WhatsApp AI';
          update public.orders
          set customer_name = v_name, "Customer" = v_name, updated_at = now()
          where workspace_id = p_workspace_id and "Order ID" = p_order_id;
          if v_order.customer_id is not null then
            update public.customers set name = v_name where workspace_id = p_workspace_id and id = v_order.customer_id;
          end if;

        elsif v_type = 'change_city' then
          v_city := btrim(coalesce(v_params ->> 'city', ''));
          if char_length(v_city) < 2 or char_length(v_city) > 120 then
            update public.whatsapp_ai_actions set status = 'clarification', result = jsonb_build_object('reason', 'invalid_city'), completed_at = now() where id = v_action_id;
            v_results := v_results || jsonb_build_array(jsonb_build_object('type', v_type, 'applied', false, 'reason', 'invalid_city'));
            continue;
          end if;
          v_field := 'city'; v_old := to_jsonb(v_order.city); v_new := to_jsonb(v_city); v_summary := 'City changed via WhatsApp AI';
          update public.orders
          set city = v_city, city_name = v_city, raw_city = v_city,
              ozon_city_id = null, coliaty_city_id = null, provider_city_id = null,
              city_mapping_status = 'unresolved', updated_at = now()
          where workspace_id = p_workspace_id and "Order ID" = p_order_id;
          if v_order.customer_id is not null then
            update public.customers set city = v_city where workspace_id = p_workspace_id and id = v_order.customer_id;
          end if;

        else
          v_note := left(btrim(coalesce(v_params ->> 'note', '')), 2000);
          if v_note = '' then
            update public.whatsapp_ai_actions set status = 'clarification', result = jsonb_build_object('reason', 'missing_note'), completed_at = now() where id = v_action_id;
            v_results := v_results || jsonb_build_array(jsonb_build_object('type', v_type, 'applied', false, 'reason', 'missing_note'));
            continue;
          end if;
          v_field := 'customer_note'; v_old := to_jsonb(v_order.notes); v_new := to_jsonb(concat_ws(E'\n', nullif(v_order.notes, ''), v_note)); v_summary := 'Customer note added via WhatsApp AI';
          update public.orders set notes = v_new #>> '{}', updated_at = now()
          where workspace_id = p_workspace_id and "Order ID" = p_order_id;
          v_author_id := v_order.assigned_to;
          if v_author_id is null then
            select pw.profile_id into v_author_id
            from public.profile_workspaces pw
            join public.profiles p on p.id = pw.profile_id
            where pw.workspace_id = p_workspace_id
            order by case lower(coalesce(p.role, '')) when 'owner' then 0 when 'supervisor' then 1 else 2 end
            limit 1;
          end if;
          if v_author_id is not null then
            insert into public.confirmation_notes(workspace_id, order_id, customer_id, author_id, body)
            values (p_workspace_id, p_order_id, v_order.customer_id, v_author_id, v_note);
          end if;
        end if;

        insert into public.whatsapp_order_changes(workspace_id, order_id, ai_action_id, field_name, old_value, new_value, source, summary)
        values (p_workspace_id, p_order_id, v_action_id, v_field, v_old, v_new, 'whatsapp_ai', v_summary);
        update public.orders
        set whatsapp_last_change_at = now(), whatsapp_last_change_source = 'whatsapp_ai', whatsapp_last_change_summary = v_summary
        where workspace_id = p_workspace_id and "Order ID" = p_order_id;
        update public.whatsapp_ai_actions
        set status = 'applied', result = jsonb_build_object('summary', v_summary), completed_at = now()
        where id = v_action_id;
        v_action_changes := jsonb_build_array(jsonb_build_object('field', v_field, 'old_value', v_old, 'new_value', v_new, 'source', 'whatsapp_ai'));
        v_any_applied := true;

      else
        v_intent := case v_type
          when 'set_callback' then 'callback'
          when 'add_order_note' then 'add_note'
          else v_type
        end;
        v_single_decision := jsonb_build_object(
          'intent', v_intent,
          'parameters', v_params,
          'confidence', coalesce(p_decision -> 'confidence', '0'::jsonb),
          'needs_clarification', false,
          'reply_text', ''
        );
        v_single_result := public.execute_whatsapp_ai_action(p_workspace_id, p_order_id, v_event_id, p_inbound_message_id, v_single_decision);
        select coalesce(jsonb_agg(jsonb_build_object('field', c.field_name, 'old_value', c.old_value, 'new_value', c.new_value, 'source', c.source)), '[]'::jsonb)
        into v_action_changes
        from public.whatsapp_order_changes c
        join public.whatsapp_ai_actions a on a.id = c.ai_action_id
        where a.workspace_id = p_workspace_id and a.provider_event_id = v_event_id;
        v_any_applied := v_any_applied or coalesce((v_single_result ->> 'applied')::boolean, false);
      end if;

      v_changes := v_changes || v_action_changes;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'type', v_type,
        'applied', coalesce((v_single_result ->> 'applied')::boolean, true),
        'changes', v_action_changes
      ));
    exception when others then
      v_results := v_results || jsonb_build_array(jsonb_build_object('type', coalesce(v_type, 'unknown'), 'applied', false, 'reason', 'action_failed'));
    end;
  end loop;

  if p_inbound_message_id is not null then
    update public.whatsapp_messages
    set reply_action = 'ai:multi_action', processed_at = now()
    where workspace_id = p_workspace_id and id = p_inbound_message_id;
  end if;
  return jsonb_build_object('applied', v_any_applied, 'action', 'multi_action', 'actions', v_results, 'changes', v_changes, 'reply_text', null);
end;
$function$;

revoke all on function public.execute_whatsapp_ai_actions(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.execute_whatsapp_ai_actions(uuid, uuid, text, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
