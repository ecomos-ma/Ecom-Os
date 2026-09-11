begin;

-- Confirmation CRM audit fields used by human status updates. These are
-- additive because production already contains orders that must be preserved.
alter table public.orders
  add column if not exists confirmation_source text,
  add column if not exists confirmed_by_user_id uuid references public.profiles(id) on delete set null;

comment on column public.orders.confirmation_source is
  'Source that confirmed the order, for example human or whatsapp.';
comment on column public.orders.confirmed_by_user_id is
  'Workspace user who manually confirmed the order.';

-- Give every existing WhatsApp workspace an editable No Answer template. The
-- rule remains opt-in for automatic sending, while an agent can explicitly
-- queue it from Confirmation CRM.
insert into public.whatsapp_automation_rules (
  workspace_id,
  rule_key,
  display_name,
  event_type,
  enabled,
  status_source,
  trigger_statuses,
  text_enabled,
  text_template,
  audio_enabled,
  audio_recording_id,
  fallback_text_enabled,
  fallback_text,
  channel_sequence,
  message_steps,
  delay_minutes,
  expires_after_minutes
)
select
  settings.workspace_id,
  'status-no-answer',
  'No answer follow-up',
  'status',
  false,
  'status',
  array['no_answer'],
  true,
  E'السلام عليكم {{customer_name}} 👋\n\nحاولنا نتاصلو بيك بخصوص الطلب ديالك رقم {{order_number}} وما قدرناش نوصلو ليك.\n\n🛒 الطلب:\n{{products}}\n\n💰 المجموع: {{total}} DH\n📍 المدينة: {{city}}\n\nعافاك جاوبنا هنا وقل لينا علاش ما قدرتيش تجاوب، أو الوقت المناسب باش نعاودو نتاصلو بيك. شكراً 🙏',
  false,
  null,
  true,
  E'عافاك جاوبنا بخصوص الطلب {{order_number}} أو قل لينا الوقت المناسب للاتصال. 🙏',
  array['text'],
  jsonb_build_array(jsonb_build_object(
    'id', 'no-answer-text-1',
    'type', 'text',
    'text_template', E'السلام عليكم {{customer_name}} 👋\n\nحاولنا نتاصلو بيك بخصوص الطلب ديالك رقم {{order_number}} وما قدرناش نوصلو ليك.\n\n🛒 الطلب:\n{{products}}\n\n💰 المجموع: {{total}} DH\n📍 المدينة: {{city}}\n\nعافاك جاوبنا هنا وقل لينا علاش ما قدرتيش تجاوب، أو الوقت المناسب باش نعاودو نتاصلو بيك. شكراً 🙏',
    'audio_recording_id', null
  )),
  0,
  1440
from public.whatsapp_settings settings
on conflict (workspace_id, rule_key) do nothing;

notify pgrst, 'reload schema';

commit;
