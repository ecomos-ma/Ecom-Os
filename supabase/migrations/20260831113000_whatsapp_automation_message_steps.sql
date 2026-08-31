-- Seller-authored WhatsApp sequences.  Each rule can now contain multiple
-- independent text and voice steps, while legacy text/audio fields remain a
-- backwards-compatible summary for the existing queue contract.

begin;

alter table public.whatsapp_automation_rules
  add column if not exists message_steps jsonb not null default '[]'::jsonb;

alter table public.whatsapp_automation_rules
  drop constraint if exists whatsapp_automation_rules_message_steps_array_check;

alter table public.whatsapp_automation_rules
  add constraint whatsapp_automation_rules_message_steps_array_check
  check (jsonb_typeof(message_steps) = 'array') not valid;

alter table public.whatsapp_automation_rules
  validate constraint whatsapp_automation_rules_message_steps_array_check;

comment on column public.whatsapp_automation_rules.message_steps is
  'Ordered seller-authored message steps: [{id, type: text|audio, text_template, audio_recording_id}].';

commit;
