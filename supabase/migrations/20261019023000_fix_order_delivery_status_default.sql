-- Prevent new orders from receiving the malformed literal "'pending'::text".
-- Existing rows are intentionally untouched; their repair is staged separately
-- under supabase/data-fixes and requires explicit production approval.

begin;

alter table public.orders
  alter column delivery_status set default 'pending';

comment on column public.orders.delivery_status is
  'Canonical carrier/delivery status. Raw provider values remain in provider-specific raw status columns.';

commit;
