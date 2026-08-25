-- Transactions Table
create table if not exists public.transactions (
    id uuid default gen_random_uuid() primary key,
    workspace_id uuid references public.workspaces(id) on delete cascade not null,
    type text not null check (type in ('income', 'expense')),
    category text,
    subcategory text,
    vendor text,
    amount numeric not null default 0,
    status text not null check (status in ('pending', 'paid', 'completed', 'cancelled')),
    date date not null default current_date,
    notes text,
    reference_id text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.transactions enable row level security;

-- Policies for transactions
create policy "Users can view their workspace transactions"
    on public.transactions for select
    using (workspace_id in (
        select workspace_id from public.workspace_users where user_id = auth.uid()
    ));

create policy "Users can insert their workspace transactions"
    on public.transactions for insert
    with check (workspace_id in (
        select workspace_id from public.workspace_users where user_id = auth.uid()
        and role in ('owner', 'admin')
    ));

create policy "Users can update their workspace transactions"
    on public.transactions for update
    using (workspace_id in (
        select workspace_id from public.workspace_users where user_id = auth.uid()
        and role in ('owner', 'admin')
    ));

create policy "Users can delete their workspace transactions"
    on public.transactions for delete
    using (workspace_id in (
        select workspace_id from public.workspace_users where user_id = auth.uid()
        and role in ('owner', 'admin')
    ));

-- Indexes for performance
create index if not exists idx_transactions_workspace_id on public.transactions(workspace_id);
create index if not exists idx_transactions_date on public.transactions(date);
create index if not exists idx_transactions_type on public.transactions(type);

-- Shipping Payouts Table
create table if not exists public.shipping_payouts (
    id uuid default gen_random_uuid() primary key,
    workspace_id uuid references public.workspaces(id) on delete cascade not null,
    shipping_company text not null,
    amount numeric not null default 0,
    period_start date,
    period_end date,
    due_date date,
    status text not null check (status in ('pending', 'received')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.shipping_payouts enable row level security;

-- Policies for shipping payouts
create policy "Users can view their workspace shipping payouts"
    on public.shipping_payouts for select
    using (workspace_id in (
        select workspace_id from public.workspace_users where user_id = auth.uid()
    ));

create policy "Users can insert their workspace shipping payouts"
    on public.shipping_payouts for insert
    with check (workspace_id in (
        select workspace_id from public.workspace_users where user_id = auth.uid()
        and role in ('owner', 'admin')
    ));

create policy "Users can update their workspace shipping payouts"
    on public.shipping_payouts for update
    using (workspace_id in (
        select workspace_id from public.workspace_users where user_id = auth.uid()
        and role in ('owner', 'admin')
    ));

create policy "Users can delete their workspace shipping payouts"
    on public.shipping_payouts for delete
    using (workspace_id in (
        select workspace_id from public.workspace_users where user_id = auth.uid()
        and role in ('owner', 'admin')
    ));

-- Indexes for performance
create index if not exists idx_shipping_payouts_workspace_id on public.shipping_payouts(workspace_id);
create index if not exists idx_shipping_payouts_status on public.shipping_payouts(status);

-- Function to update updated_at automatically
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$ language plpgsql;

create trigger update_transactions_updated_at
    before update on public.transactions
    for each row
    execute function update_updated_at_column();

create trigger update_shipping_payouts_updated_at
    before update on public.shipping_payouts
    for each row
    execute function update_updated_at_column();
