-- Restartable product/variant seed from already-normalized YouCan order items.
-- Full provider reconciliation later enriches canonical product metadata and inventory.

with candidates as (
  select distinct on (oi.workspace_id, oi.integration_id, oi.external_product_id)
    oi.workspace_id,
    oi.integration_id,
    oi.external_product_id,
    oi.product_name,
    oi.sku,
    oi.unit_price,
    oi.image_url,
    oi.created_at
  from public.youcan_order_items oi
  where oi.external_product_id is not null
  order by oi.workspace_id, oi.integration_id, oi.external_product_id,
    (oi.image_url is not null) desc, oi.created_at desc
)
insert into public.products (
  workspace_id, source_integration_id, external_product_id, youcan_product_id,
  name, sku, price, cost, stock, initial_stock, image_url, status,
  inventory_tracking_enabled, inventory_metadata, provider_updated_at
)
select
  c.workspace_id,
  c.integration_id,
  c.external_product_id,
  c.external_product_id,
  coalesce(nullif(c.product_name, ''), nullif(c.sku, ''), 'YouCan product'),
  case when c.sku is not null and not exists (
    select 1 from public.products occupied
    where occupied.workspace_id = c.workspace_id and occupied.sku = c.sku
  ) then c.sku else null end,
  coalesce(c.unit_price, 0),
  0,
  0,
  0,
  c.image_url,
  'active',
  false,
  jsonb_build_object('inventory_source', 'youcan', 'created_from', 'youcan_order_backfill'),
  c.created_at
from candidates c
on conflict (workspace_id, youcan_product_id) do update
set source_integration_id = coalesce(public.products.source_integration_id, excluded.source_integration_id),
    external_product_id = coalesce(public.products.external_product_id, excluded.external_product_id),
    image_url = coalesce(public.products.image_url, excluded.image_url),
    provider_updated_at = greatest(public.products.provider_updated_at, excluded.provider_updated_at),
    updated_at = now();

with variants as (
  select distinct on (oi.workspace_id, oi.integration_id, oi.external_variant_id)
    oi.workspace_id,
    oi.integration_id,
    oi.external_product_id,
    oi.external_variant_id,
    coalesce(nullif(oi.variant_name, ''), 'Default') as variant_name,
    oi.sku,
    oi.unit_price,
    oi.image_url,
    oi.created_at
  from public.youcan_order_items oi
  where oi.external_product_id is not null and oi.external_variant_id is not null
  order by oi.workspace_id, oi.integration_id, oi.external_variant_id,
    (oi.image_url is not null) desc, oi.created_at desc
)
insert into public.product_variants (
  workspace_id, product_id, source_integration_id, external_variant_id,
  variant_name, variant_value, sku, price, cost, stock, image_url,
  is_active, provider_updated_at
)
select
  v.workspace_id,
  p.id,
  v.integration_id,
  v.external_variant_id,
  v.variant_name,
  v.variant_name,
  v.sku,
  coalesce(v.unit_price, 0),
  0,
  0,
  v.image_url,
  true,
  v.created_at
from variants v
join public.products p
  on p.workspace_id = v.workspace_id and p.youcan_product_id = v.external_product_id
where not exists (
  select 1 from public.product_variants existing
  where existing.workspace_id = v.workspace_id
    and existing.source_integration_id = v.integration_id
    and existing.external_variant_id = v.external_variant_id
)
and not exists (
  select 1 from public.product_variants existing
  where existing.workspace_id = v.workspace_id
    and existing.product_id = p.id
    and existing.variant_name = v.variant_name
    and existing.variant_value = v.variant_name
);

update public.product_variants pv
set image_url = source.image_url,
    provider_updated_at = greatest(pv.provider_updated_at, source.created_at),
    updated_at = now()
from (
  select distinct on (workspace_id, integration_id, external_variant_id)
    workspace_id, integration_id, external_variant_id, image_url, created_at
  from public.youcan_order_items
  where external_variant_id is not null and image_url is not null
  order by workspace_id, integration_id, external_variant_id, created_at desc
) source
where pv.workspace_id = source.workspace_id
  and pv.source_integration_id = source.integration_id
  and pv.external_variant_id = source.external_variant_id
  and pv.image_url is null;
