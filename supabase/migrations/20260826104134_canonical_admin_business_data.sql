-- Canonical cross-tenant business data services for the active /admin console.
-- All reads are paginated, permission specific, and use the same status
-- normalization and KPI denominators as the seller dashboard.

begin;

create index if not exists orders_workspace_created_admin_idx
  on public.orders(workspace_id, created_at desc);
create index if not exists products_workspace_created_admin_idx
  on public.products(workspace_id, created_at desc);
create index if not exists meta_campaigns_workspace_updated_admin_idx
  on public.meta_campaigns(workspace_id, updated_at desc);

create or replace function public.platform_list_sellers_v1(
  p_page integer default 1,
  p_page_size integer default 25,
  p_query text default null,
  p_plan text default null,
  p_subscription_status text default null,
  p_health text default null,
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_start date := coalesce(p_start_date, (now() at time zone 'Africa/Casablanca')::date - 29);
  selected_end date := coalesce(p_end_date, (now() at time zone 'Africa/Casablanca')::date);
  range_start timestamptz;
  range_end timestamptz;
  current_page integer := greatest(coalesce(p_page, 1), 1);
  size_value integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  result jsonb;
begin
  if not public.has_platform_permission('workspaces.read') then
    raise exception 'SELLERS_READ_REQUIRED' using errcode = '42501';
  end if;
  if selected_end < selected_start then
    raise exception 'INVALID_DATE_RANGE' using errcode = '22023';
  end if;
  range_start := selected_start::timestamp at time zone 'Africa/Casablanca';
  range_end := (selected_end + 1)::timestamp at time zone 'Africa/Casablanca';

  with owner_profiles as (
    select distinct owner.owner_user_id
    from public.workspace_subscription_owners owner
  ), owned_workspaces as (
    select owner.owner_user_id, workspace.id as workspace_id, workspace.name, workspace.created_at
    from public.workspace_subscription_owners owner
    join public.workspaces workspace on workspace.id = owner.workspace_id
    where workspace.deleted_at is null
  ), primary_workspace as (
    select distinct on (owned.owner_user_id)
      owned.owner_user_id, owned.workspace_id, owned.name
    from owned_workspaces owned
    order by owned.owner_user_id, owned.created_at, owned.workspace_id
  ), normalized_orders as (
    select
      owned.owner_user_id,
      orders.workspace_id,
      coalesce(orders.total, 0) as total,
      orders.created_at,
      lower(coalesce(
        nullif(to_jsonb(orders) ->> 'shipping_status', ''),
        nullif(to_jsonb(orders) ->> 'delivery_status', ''),
        orders.status,
        ''
      )) as raw_status,
      public.canonical_order_status_v1(coalesce(
        nullif(to_jsonb(orders) ->> 'shipping_status', ''),
        nullif(to_jsonb(orders) ->> 'delivery_status', ''),
        orders.status
      )) as canonical_status
    from public.orders orders
    join owned_workspaces owned on owned.workspace_id = orders.workspace_id
    where orders.created_at >= range_start and orders.created_at < range_end
  ), order_metrics as (
    select
      orders.owner_user_id,
      count(*) as orders,
      count(*) filter (where orders.canonical_status in ('NEW', 'READY')) as pending,
      count(*) filter (where orders.canonical_status in ('CONFIRMED','PROCESSED','READY','OUT_FOR_DELIVERY','DELIVERED','COMING_BACK')) as confirmed_chain,
      count(*) filter (where orders.canonical_status = 'DELIVERED') as delivered,
      count(*) filter (where orders.raw_status ~ '(retour|return)') as returned,
      count(*) filter (where orders.raw_status ~ '(cancel|annul)') as cancelled,
      coalesce(sum(orders.total), 0) as gross_order_value,
      coalesce(sum(orders.total) filter (where orders.canonical_status in ('CONFIRMED','PROCESSED','READY','OUT_FOR_DELIVERY','DELIVERED','COMING_BACK')), 0) as confirmed_order_value,
      coalesce(sum(orders.total) filter (where orders.canonical_status = 'DELIVERED'), 0) as delivered_revenue
    from normalized_orders orders
    group by orders.owner_user_id
  ), workspace_metrics as (
    select owned.owner_user_id, count(*) as workspace_count
    from owned_workspaces owned group by owned.owner_user_id
  ), team_metrics as (
    select owned.owner_user_id, count(distinct membership.profile_id) as team_count
    from owned_workspaces owned
    join public.profile_workspaces membership on membership.workspace_id = owned.workspace_id
    where coalesce(to_jsonb(membership) ->> 'status', 'active') = 'active'
    group by owned.owner_user_id
  ), product_metrics as (
    select owned.owner_user_id, count(product.id) as product_count
    from owned_workspaces owned
    left join public.products product on product.workspace_id = owned.workspace_id
    group by owned.owner_user_id
  ), campaign_metrics as (
    select source.owner_user_id, count(*) filter (where source.active) as active_campaigns
    from (
      select owned.owner_user_id, upper(coalesce(meta.status, '')) in ('ACTIVE','ENABLED') as active
      from owned_workspaces owned join public.meta_campaigns meta on meta.workspace_id = owned.workspace_id
      union all
      select owned.owner_user_id, upper(coalesce(tiktok.status, '')) in ('ACTIVE','ENABLE','ENABLED') as active
      from owned_workspaces owned join public.tiktok_campaigns tiktok on tiktok.workspace_id = owned.workspace_id and not tiktok.is_deleted
    ) source
    group by source.owner_user_id
  ), seller_rows as (
    select
      profile.id,
      profile.full_name,
      coalesce(auth_user.email, profile.email) as email,
      profile.avatar_url,
      profile.created_at,
      profile.last_active,
      primary_workspace.workspace_id as primary_workspace_id,
      primary_workspace.name as primary_workspace_name,
      coalesce(account.state, case when coalesce(profile.is_active, true) then 'active' else 'suspended' end) as account_state,
      plan.code as plan_code,
      plan.name as plan_name,
      coalesce(subscription.status, 'unassigned') as subscription_status,
      subscription.billing_cycle,
      subscription.current_period_end,
      coalesce(workspace_metrics.workspace_count, 0) as workspace_count,
      coalesce(team_metrics.team_count, 0) as team_count,
      coalesce(product_metrics.product_count, 0) as product_count,
      coalesce(campaign_metrics.active_campaigns, 0) as active_campaigns,
      coalesce(order_metrics.orders, 0) as orders,
      coalesce(order_metrics.pending, 0) as pending,
      coalesce(order_metrics.confirmed_chain, 0) as confirmed,
      coalesce(order_metrics.delivered, 0) as delivered,
      coalesce(order_metrics.returned, 0) as returned,
      coalesce(order_metrics.cancelled, 0) as cancelled,
      coalesce(order_metrics.gross_order_value, 0) as gross_order_value,
      coalesce(order_metrics.confirmed_order_value, 0) as confirmed_order_value,
      coalesce(order_metrics.delivered_revenue, 0) as delivered_revenue,
      case when coalesce(order_metrics.orders, 0) = 0 then 0 else round(coalesce(order_metrics.confirmed_chain, 0)::numeric / order_metrics.orders * 100, 2) end as confirmation_rate,
      case when coalesce(order_metrics.confirmed_chain, 0) = 0 then 0 else round(coalesce(order_metrics.delivered, 0)::numeric / order_metrics.confirmed_chain * 100, 2) end as delivery_rate,
      case
        when coalesce(account.state, '') in ('suspended','closed') or not coalesce(profile.is_active, true) then 'critical'
        when subscription.id is null or subscription.status not in ('active','grace') then 'attention'
        else 'healthy'
      end as health
    from owner_profiles owner
    join public.profiles profile on profile.id = owner.owner_user_id and profile.deleted_at is null
    left join auth.users auth_user on auth_user.id = profile.id
    left join public.founder_account_controls account on account.profile_id = profile.id
    left join primary_workspace on primary_workspace.owner_user_id = profile.id
    left join public.user_subscriptions subscription on subscription.owner_user_id = profile.id
    left join public.subscription_plans plan on plan.id = subscription.plan_id
    left join workspace_metrics on workspace_metrics.owner_user_id = profile.id
    left join team_metrics on team_metrics.owner_user_id = profile.id
    left join product_metrics on product_metrics.owner_user_id = profile.id
    left join campaign_metrics on campaign_metrics.owner_user_id = profile.id
    left join order_metrics on order_metrics.owner_user_id = profile.id
  ), filtered as (
    select * from seller_rows seller
    where (
      p_query is null or trim(p_query) = ''
      or coalesce(seller.full_name, '') ilike '%' || trim(p_query) || '%'
      or coalesce(seller.email, '') ilike '%' || trim(p_query) || '%'
      or coalesce(seller.primary_workspace_name, '') ilike '%' || trim(p_query) || '%'
      or seller.id::text = trim(p_query)
    )
      and (p_plan is null or trim(p_plan) = '' or lower(coalesce(seller.plan_code, '')) = lower(trim(p_plan)))
      and (p_subscription_status is null or trim(p_subscription_status) = '' or lower(seller.subscription_status) = lower(trim(p_subscription_status)))
      and (p_health is null or trim(p_health) = '' or seller.health = lower(trim(p_health)))
  ), paged as (
    select * from filtered
    order by delivered_revenue desc, orders desc, created_at desc
    limit size_value offset (current_page - 1) * size_value
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(paged) order by paged.delivered_revenue desc, paged.orders desc) from paged), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'page', current_page,
    'page_size', size_value,
    'range', jsonb_build_object('start_date', selected_start, 'end_date', selected_end, 'timezone', 'Africa/Casablanca'),
    'definitions', jsonb_build_object(
      'gross_order_value', 'Sum of every order total in the selected period.',
      'confirmed_order_value', 'Sum of orders that entered the confirmed fulfilment chain.',
      'delivered_revenue', 'Sum of delivered order totals only.',
      'confirmation_rate', 'Confirmed fulfilment-chain orders divided by all orders.',
      'delivery_rate', 'Delivered orders divided by confirmed fulfilment-chain orders.'
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.platform_list_products_v1(
  p_page integer default 1,
  p_page_size integer default 25,
  p_query text default null,
  p_status text default null,
  p_workspace_id uuid default null,
  p_stock_state text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_page integer := greatest(coalesce(p_page, 1), 1);
  size_value integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  result jsonb;
begin
  if not public.has_platform_permission('products.read_all') then
    raise exception 'PRODUCTS_READ_REQUIRED' using errcode = '42501';
  end if;
  with delivered_items as (
    select item.product_id,
      coalesce(sum(item.quantity), 0) as units_sold,
      coalesce(sum(item.quantity * item.unit_price), 0) as delivered_revenue
    from public.order_items item
    join public.orders orders on to_jsonb(orders) ->> 'Order ID' = item.order_id::text
    where public.canonical_order_status_v1(coalesce(to_jsonb(orders) ->> 'shipping_status', to_jsonb(orders) ->> 'delivery_status', orders.status)) = 'DELIVERED'
    group by item.product_id
  ), product_rows as (
    select
      product.id,
      product.workspace_id,
      workspace.name as workspace_name,
      owner.owner_user_id,
      owner_profile.full_name as seller_name,
      coalesce(owner_auth.email, owner_profile.email) as seller_email,
      product.name,
      product.sku,
      product.image_url,
      product.category,
      product.cost,
      product.price,
      product.stock,
      product.low_stock_threshold,
      product.status,
      product.created_at,
      coalesce(delivered.units_sold, 0) as units_sold,
      coalesce(delivered.delivered_revenue, 0) as delivered_revenue,
      case when product.stock <= 0 then 'out_of_stock' when product.stock <= product.low_stock_threshold then 'low_stock' else 'in_stock' end as stock_state
    from public.products product
    join public.workspaces workspace on workspace.id = product.workspace_id
    left join public.workspace_subscription_owners owner on owner.workspace_id = product.workspace_id
    left join public.profiles owner_profile on owner_profile.id = owner.owner_user_id
    left join auth.users owner_auth on owner_auth.id = owner.owner_user_id
    left join delivered_items delivered on delivered.product_id = product.id
    where workspace.deleted_at is null
  ), filtered as (
    select * from product_rows product
    where (p_query is null or trim(p_query) = '' or product.name ilike '%' || trim(p_query) || '%' or coalesce(product.sku, '') ilike '%' || trim(p_query) || '%' or product.workspace_name ilike '%' || trim(p_query) || '%' or coalesce(product.seller_email, '') ilike '%' || trim(p_query) || '%')
      and (p_status is null or trim(p_status) = '' or lower(product.status) = lower(trim(p_status)))
      and (p_workspace_id is null or product.workspace_id = p_workspace_id)
      and (p_stock_state is null or trim(p_stock_state) = '' or product.stock_state = lower(trim(p_stock_state)))
  ), paged as (
    select * from filtered order by created_at desc, id desc
    limit size_value offset (current_page - 1) * size_value
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(paged) order by paged.created_at desc) from paged), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'page', current_page,
    'page_size', size_value
  ) into result;
  return result;
end;
$$;

create or replace function public.platform_list_campaigns_v1(
  p_page integer default 1,
  p_page_size integer default 25,
  p_query text default null,
  p_platform text default null,
  p_status text default null,
  p_workspace_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_page integer := greatest(coalesce(p_page, 1), 1);
  size_value integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  result jsonb;
begin
  if not public.has_platform_permission('campaigns.read_all') then
    raise exception 'CAMPAIGNS_READ_REQUIRED' using errcode = '42501';
  end if;
  with tiktok_spend as (
    select insight.workspace_id, insight.entity_id,
      coalesce(sum(insight.spend), 0) as spend,
      coalesce(sum(insight.impressions), 0) as impressions,
      coalesce(sum(insight.clicks), 0) as clicks,
      coalesce(sum(insight.conversions), 0) as conversions,
      max(insight.currency) as currency,
      max(insight.updated_at) as metric_updated_at
    from public.tiktok_ad_insights insight
    where insight.reporting_level = 'campaign'
    group by insight.workspace_id, insight.entity_id
  ), sources as (
    select meta.id, meta.workspace_id, 'meta'::text as platform, meta.meta_campaign_id as external_id,
      meta.campaign_name as name, meta.status, meta.budget, meta.spend, meta.impressions,
      meta.clicks, meta.results::numeric as conversions, meta.cost_per_result,
      null::numeric as attributed_revenue, null::numeric as roas, null::text as currency,
      meta.updated_at, true as metrics_available, false as attribution_available
    from public.meta_campaigns meta
    union all
    select tiktok.id, tiktok.workspace_id, 'tiktok'::text, tiktok.tiktok_campaign_id,
      tiktok.name, tiktok.status, tiktok.budget, coalesce(spend.spend, 0), coalesce(spend.impressions, 0),
      coalesce(spend.clicks, 0), coalesce(spend.conversions, 0),
      case when coalesce(spend.conversions, 0) = 0 then null else round(spend.spend / spend.conversions, 4) end,
      null::numeric, null::numeric, coalesce(spend.currency, tiktok.currency),
      coalesce(spend.metric_updated_at, tiktok.synced_at), spend.entity_id is not null, false
    from public.tiktok_campaigns tiktok
    left join tiktok_spend spend on spend.workspace_id = tiktok.workspace_id and spend.entity_id = tiktok.tiktok_campaign_id
    where not tiktok.is_deleted
    union all
    select campaign.id, campaign.workspace_id, coalesce(nullif(lower(campaign.platform), ''), 'manual'), campaign.id::text,
      campaign.name, 'UNKNOWN', null::numeric, null::numeric, null::bigint, null::bigint,
      null::numeric, null::numeric, null::numeric, null::numeric, null::text,
      campaign.created_at, false, false
    from public.campaigns campaign
  ), campaign_rows as (
    select source.*, workspace.name as workspace_name, owner.owner_user_id,
      owner_profile.full_name as seller_name, coalesce(owner_auth.email, owner_profile.email) as seller_email
    from sources source
    join public.workspaces workspace on workspace.id = source.workspace_id
    left join public.workspace_subscription_owners owner on owner.workspace_id = source.workspace_id
    left join public.profiles owner_profile on owner_profile.id = owner.owner_user_id
    left join auth.users owner_auth on owner_auth.id = owner.owner_user_id
    where workspace.deleted_at is null
  ), filtered as (
    select * from campaign_rows campaign
    where (p_query is null or trim(p_query) = '' or campaign.name ilike '%' || trim(p_query) || '%' or campaign.workspace_name ilike '%' || trim(p_query) || '%' or coalesce(campaign.seller_email, '') ilike '%' || trim(p_query) || '%' or campaign.external_id ilike '%' || trim(p_query) || '%')
      and (p_platform is null or trim(p_platform) = '' or campaign.platform = lower(trim(p_platform)))
      and (p_status is null or trim(p_status) = '' or lower(campaign.status) = lower(trim(p_status)))
      and (p_workspace_id is null or campaign.workspace_id = p_workspace_id)
  ), paged as (
    select * from filtered order by updated_at desc nulls last, id desc
    limit size_value offset (current_page - 1) * size_value
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(paged) order by paged.updated_at desc nulls last) from paged), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'page', current_page,
    'page_size', size_value,
    'attribution_rule', 'ROAS is null unless a verified campaign-to-order attribution source exists.'
  ) into result;
  return result;
end;
$$;

revoke all on function public.platform_list_sellers_v1(integer, integer, text, text, text, text, date, date) from public, anon;
revoke all on function public.platform_list_products_v1(integer, integer, text, text, uuid, text) from public, anon;
revoke all on function public.platform_list_campaigns_v1(integer, integer, text, text, text, uuid) from public, anon;
grant execute on function public.platform_list_sellers_v1(integer, integer, text, text, text, text, date, date) to authenticated, service_role;
grant execute on function public.platform_list_products_v1(integer, integer, text, text, uuid, text) to authenticated, service_role;
grant execute on function public.platform_list_campaigns_v1(integer, integer, text, text, text, uuid) to authenticated, service_role;

commit;
