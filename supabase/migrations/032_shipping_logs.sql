-- Create shipping logs table for tracking audit trail

create table if not exists public.shipping_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  order_number text,
  tracking_number text,
  event_type text not null check (event_type in ('tracking_sync', 'status_change', 'error')),
  event_data jsonb,
  success boolean not null default false,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.shipping_logs enable row level security;

create policy "Workspace isolation for shipping_logs"
  on public.shipping_logs for all using (workspace_id = public.get_my_workspace_id());

-- Create indexes
create index if not exists idx_shipping_logs_workspace on public.shipping_logs (workspace_id);
create index if not exists idx_shipping_logs_order on public.shipping_logs (order_id);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shipping_logs' AND column_name = 'tracking_number'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_shipping_logs_tracking ON public.shipping_logs (tracking_number)';
  ELSE
    RAISE NOTICE 'Column tracking_number not present on public.shipping_logs; skipping index creation';
  END IF;
END$$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shipping_logs' AND column_name = 'created_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_shipping_logs_created_at ON public.shipping_logs (created_at)';
  ELSE
    RAISE NOTICE 'Column created_at not present on public.shipping_logs; skipping created_at index';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shipping_logs' AND column_name = 'event_type'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_shipping_logs_event_type ON public.shipping_logs (event_type)';
  ELSE
    RAISE NOTICE 'Column event_type not present on public.shipping_logs; skipping event_type index';
  END IF;
END$$;
