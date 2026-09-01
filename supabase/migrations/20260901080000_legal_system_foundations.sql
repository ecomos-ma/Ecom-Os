-- Legal System Foundations
-- Core tables for legal document management, data deletion requests, and refund tracking

-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- 1. Legal Acceptance Tracking
create table if not exists public.legal_acceptance (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamp with time zone not null default now(),
  acceptance_source text not null default 'signup',
  ip_address text,
  user_agent text,
  created_at timestamp with time zone not null default now()
);

-- 2. Data Deletion Requests
create table if not exists public.data_deletion_requests (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null default 'data_deletion',
  reason text,
  status text not null default 'requested',
  data_to_delete text[] default array[]::text[],
  requested_at timestamp with time zone not null default now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid references auth.users(id) on delete set null,
  admin_notes text,
  user_visible_reason text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- 3. Refund Requests
create table if not exists public.refund_requests (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  payment_reference text,
  amount numeric(12, 2),
  reason text,
  status text not null default 'pending',
  created_at timestamp with time zone not null default now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid references auth.users(id) on delete set null,
  admin_response text
);

-- 4. Platform Legal Settings
create table if not exists public.platform_legal_settings (
  id uuid default uuid_generate_v4() primary key,
  company_display_name text default 'Ecom OS',
  company_legal_name text,
  company_registration text,
  tax_identifier text,
  business_address text,
  jurisdiction text default 'Morocco',
  support_email text,
  support_whatsapp text,
  legal_email text,
  support_hours text,
  terms_version text default '1.0',
  privacy_version text default '1.0',
  refund_policy_version text default '1.0',
  terms_last_updated timestamp with time zone,
  privacy_last_updated timestamp with time zone,
  refund_last_updated timestamp with time zone,
  refund_period_days int default 30,
  auto_approve_refunds boolean default false,
  data_deletion_enabled boolean default true,
  deletion_grace_period_days int default 7,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- 5. Account Deletion Audit Log (non-PII)
create table if not exists public.account_deletion_audit (
  id uuid default uuid_generate_v4() primary key,
  hashed_email text,
  deletion_reason text,
  deleted_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now()
);

-- Indexes for performance
create index if not exists idx_legal_acceptance_user_id on public.legal_acceptance(user_id);
create index if not exists idx_legal_acceptance_accepted_at on public.legal_acceptance(accepted_at);
create index if not exists idx_data_deletion_requests_user_id on public.data_deletion_requests(user_id);
create index if not exists idx_data_deletion_requests_status on public.data_deletion_requests(status);
create index if not exists idx_refund_requests_user_id on public.refund_requests(user_id);
create index if not exists idx_refund_requests_status on public.refund_requests(status);

-- Enable RLS
alter table public.legal_acceptance enable row level security;
alter table public.data_deletion_requests enable row level security;
alter table public.refund_requests enable row level security;
alter table public.platform_legal_settings enable row level security;
alter table public.account_deletion_audit enable row level security;

-- RLS Policies for legal_acceptance
create policy "Users can read own legal acceptance" on public.legal_acceptance
  for select using (auth.uid() = user_id);

create policy "Admin roles can read all legal acceptance" on public.legal_acceptance
  for select using (
    exists(
      select 1 from public.admin_roles
      where admin_roles.user_id = auth.uid()
        and admin_roles.role in ('super_admin', 'legal_admin')
    )
  );

-- RLS Policies for data_deletion_requests
create policy "Users can read own deletion requests" on public.data_deletion_requests
  for select using (auth.uid() = user_id);

create policy "Users can create deletion requests" on public.data_deletion_requests
  for insert with check (auth.uid() = user_id);

create policy "Admin roles can manage deletion requests" on public.data_deletion_requests
  for all using (
    exists(
      select 1 from public.admin_roles
      where admin_roles.user_id = auth.uid()
        and admin_roles.role in ('super_admin', 'legal_admin')
    )
  );

-- RLS Policies for refund_requests
create policy "Users can read own refund requests" on public.refund_requests
  for select using (auth.uid() = user_id);

create policy "Users can create refund requests" on public.refund_requests
  for insert with check (auth.uid() = user_id);

create policy "Admin roles can manage refund requests" on public.refund_requests
  for all using (
    exists(
      select 1 from public.admin_roles
      where admin_roles.user_id = auth.uid()
        and admin_roles.role in ('super_admin', 'legal_admin', 'billing_admin')
    )
  );

-- RLS Policies for platform_legal_settings
create policy "Authenticated users can read legal settings" on public.platform_legal_settings
  for select using (auth.role() = 'authenticated');

create policy "Admin roles can manage legal settings" on public.platform_legal_settings
  for all using (
    exists(
      select 1 from public.admin_roles
      where admin_roles.user_id = auth.uid()
        and admin_roles.role in ('super_admin', 'legal_admin')
    )
  );

-- RLS Policies for account_deletion_audit
create policy "Audit is read-only for admins" on public.account_deletion_audit
  for select using (
    exists(
      select 1 from public.admin_roles
      where admin_roles.user_id = auth.uid()
        and admin_roles.role in ('super_admin', 'legal_admin')
    )
  );

create policy "Only service role can insert audit" on public.account_deletion_audit
  for insert with check (auth.role() = 'service_role');

-- Initialize default legal settings (singleton)
insert into public.platform_legal_settings (
  company_display_name,
  company_legal_name,
  support_email,
  legal_email,
  jurisdiction,
  terms_version,
  privacy_version,
  refund_policy_version
) values (
  'Ecom OS',
  'Ecom OS SaaS',
  'support@ecomos.app',
  'legal@ecomos.app',
  'Morocco',
  '1.0',
  '1.0',
  '1.0'
)
on conflict do nothing;
