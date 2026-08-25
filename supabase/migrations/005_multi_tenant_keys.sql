-- ============================================================
-- EcomOS · Multi-Tenant Unique Constraints Fix
-- Run this in Supabase SQL Editor
-- ============================================================

-- Customers: A phone number should only be unique within a single workspace,
-- allowing different workspaces to have a customer with the same phone.
alter table public.customers drop constraint if exists customers_phone_key;
alter table public.customers drop constraint if exists customers_phone_workspace_id_key;
alter table public.customers add constraint customers_phone_workspace_id_key unique (phone, workspace_id);

-- Products: A SKU should only be unique within a single workspace.
alter table public.products drop constraint if exists products_sku_key;
alter table public.products drop constraint if exists products_sku_workspace_id_key;
alter table public.products add constraint products_sku_workspace_id_key unique (sku, workspace_id);

-- Orders: An order number (e.g. #GS-...) should only be unique within a single workspace.
alter table public.orders drop constraint if exists orders_order_number_key;
alter table public.orders drop constraint if exists orders_order_number_workspace_id_key;
alter table public.orders add constraint orders_order_number_workspace_id_key unique (order_number, workspace_id);
