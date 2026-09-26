-- Sheet-generated sync keys can repeat in different workspaces. The composite
-- unique index remains in place and matches every importer conflict target.
drop index if exists public.idx_orders_sync_key;
