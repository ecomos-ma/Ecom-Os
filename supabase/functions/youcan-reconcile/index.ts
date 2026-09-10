// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";
import { ensureYouCanWebhooks, integrationAccessToken, mapYouCanOrder, paginateYouCan, requiredYouCanEnv, youcanRequest, youCanGeneralStatus, youCanShippingStatus } from "../_shared/youcan.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function equalSecret(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}
async function upsertCustomers(
  client: SupabaseClient,
  job: any,
  customers: Record<string, any>[],
): Promise<Map<string, string>> {
  const uniqueCustomers = [...new Map(customers
    .filter((customer) => customer?.external_customer_id)
    .map((customer) => [String(customer.external_customer_id), customer])).values()];
  if (!uniqueCustomers.length) return new Map();

  const existingResult = await client.from("customers")
    .select("id,source_integration_id,external_customer_id,youcan_customer_id,phone,normalized_phone")
    .eq("workspace_id", job.workspace_id);
  if (existingResult.error) throw new Error(`customer_lookup_failed:${existingResult.error.code ?? "unknown"}`);

  const existing = existingResult.data ?? [];
  const byExternal = new Map<string, any>();
  const byPhone = new Map<string, any>();
  for (const row of existing) {
    if (row.source_integration_id === job.integration_id && row.external_customer_id) byExternal.set(String(row.external_customer_id), row);
    if (row.youcan_customer_id) byExternal.set(String(row.youcan_customer_id), row);
    if (row.normalized_phone) byPhone.set(String(row.normalized_phone), row);
    if (row.phone) byPhone.set(String(row.phone), row);
  }

  const pendingByIdentity = new Map<string, Record<string, any>>();
  const updates = new Map<string, { row: any; patch: Record<string, any> }>();
  for (const customer of uniqueCustomers) {
    const externalId = String(customer.external_customer_id);
    const phone = String(customer.normalized_phone ?? customer.phone ?? "").trim();
    const match = byExternal.get(externalId) ?? (phone ? byPhone.get(phone) : null);
    if (match?.id) {
      const patch = { ...customer };
      const phoneOwner = phone ? byPhone.get(phone) : null;
      if (phoneOwner?.id && phoneOwner.id !== match.id) {
        delete patch.phone;
        delete patch.normalized_phone;
      }
      if (match.external_customer_id && String(match.external_customer_id) !== externalId) {
        delete patch.external_customer_id;
        delete patch.youcan_customer_id;
      }
      updates.set(match.id, { row: match, patch: { ...(updates.get(match.id)?.patch ?? {}), ...patch } });
      continue;
    }
    const identity = phone ? `phone:${phone}` : `external:${externalId}`;
    if (!pendingByIdentity.has(identity)) pendingByIdentity.set(identity, customer);
  }

  const updateEntries = [...updates.entries()];
  for (let offset = 0; offset < updateEntries.length; offset += 10) {
    const results = await Promise.all(updateEntries.slice(offset, offset + 10).map(([id, value]) =>
      client.from("customers").update(value.patch).eq("id", id).eq("workspace_id", job.workspace_id)
    ));
    const failed = results.find((result) => result.error);
    if (failed?.error) throw new Error(`customer_update_failed:${failed.error.code ?? "unknown"}`);
  }

  const inserts = [...pendingByIdentity.values()];
  for (let offset = 0; offset < inserts.length; offset += 100) {
    const result = await client.from("customers").insert(inserts.slice(offset, offset + 100));
    if (result.error) throw new Error(`customer_insert_failed:${result.error.code ?? "unknown"}`);
  }

  const refreshed = await client.from("customers")
    .select("id,source_integration_id,external_customer_id,youcan_customer_id,phone,normalized_phone")
    .eq("workspace_id", job.workspace_id);
  if (refreshed.error) throw new Error(`customer_link_failed:${refreshed.error.code ?? "unknown"}`);
  const refreshedByExternal = new Map<string, string>();
  const refreshedByPhone = new Map<string, string>();
  for (const row of refreshed.data ?? []) {
    if (row.source_integration_id === job.integration_id && row.external_customer_id) refreshedByExternal.set(String(row.external_customer_id), row.id);
    if (row.youcan_customer_id) refreshedByExternal.set(String(row.youcan_customer_id), row.id);
    if (row.normalized_phone) refreshedByPhone.set(String(row.normalized_phone), row.id);
    if (row.phone) refreshedByPhone.set(String(row.phone), row.id);
  }
  return new Map(uniqueCustomers.map((customer) => {
    const externalId = String(customer.external_customer_id);
    const phone = String(customer.normalized_phone ?? customer.phone ?? "").trim();
    return [externalId, refreshedByExternal.get(externalId) ?? refreshedByPhone.get(phone) ?? ""];
  }).filter((entry) => entry[1]));
}
async function upsertProductsFromOrderItems(
  client: SupabaseClient,
  job: any,
  items: Record<string, any>[],
): Promise<number> {
  const uniqueProducts = [...new Map(items
    .filter((item) => item?.external_product_id)
    .map((item) => [String(item.external_product_id), item])).values()];
  let created = 0;
  for (const item of uniqueProducts) {
    const externalProductId = String(item.external_product_id);
    const existingExternal = await client.from("products")
      .select("id,sku,name,image_url,youcan_product_id,source_integration_id")
      .eq("workspace_id", job.workspace_id).eq("youcan_product_id", externalProductId).maybeSingle();
    let product = existingExternal.data;
    if (!product && item.sku) {
      const existingSku = await client.from("products")
        .select("id,sku,name,image_url,youcan_product_id,source_integration_id")
        .eq("workspace_id", job.workspace_id).eq("sku", item.sku).maybeSingle();
      if (existingSku.data && !existingSku.data.youcan_product_id) product = existingSku.data;
    }
    if (!product) {
      let sku = item.sku ?? null;
      if (sku) {
        const occupied = await client.from("products").select("id").eq("workspace_id", job.workspace_id).eq("sku", sku).maybeSingle();
        if (occupied.data?.id) sku = null;
      }
      const inserted = await client.from("products").insert({
        workspace_id: job.workspace_id,
        source_integration_id: job.integration_id,
        external_product_id: externalProductId,
        youcan_product_id: externalProductId,
        name: item.product_name ?? item.sku ?? "YouCan product",
        sku,
        price: Number(item.unit_price ?? 0),
        cost: 0,
        stock: 0,
        initial_stock: 0,
        image_url: item.image_url ?? null,
        status: "active",
        inventory_tracking_enabled: false,
        provider_updated_at: new Date().toISOString(),
        inventory_metadata: { inventory_source: "youcan", created_from: "youcan_order" },
      }).select("id,sku,name,image_url,youcan_product_id,source_integration_id").single();
      if (inserted.error || !inserted.data?.id) throw new Error(`order_product_insert_failed:${inserted.error?.code ?? "unknown"}`);
      product = inserted.data;
      created += 1;
    } else {
      const patch: Record<string, unknown> = {
        source_integration_id: product.source_integration_id ?? job.integration_id,
        external_product_id: product.youcan_product_id ?? externalProductId,
        youcan_product_id: product.youcan_product_id ?? externalProductId,
        provider_updated_at: new Date().toISOString(),
      };
      if (!product.image_url && item.image_url) patch.image_url = item.image_url;
      if ((!product.name || product.name === "Unknown Product") && item.product_name) patch.name = item.product_name;
      const updated = await client.from("products").update(patch).eq("id", product.id).eq("workspace_id", job.workspace_id);
      if (updated.error) throw new Error(`order_product_update_failed:${updated.error.code ?? "unknown"}`);
    }

    const externalVariantId = String(item.external_variant_id ?? "").trim();
    if (!externalVariantId) continue;
    const variantName = String(item.variant_name ?? "Default").trim() || "Default";
    const externalVariant = await client.from("product_variants").select("id,image_url")
      .eq("workspace_id", job.workspace_id).eq("source_integration_id", job.integration_id)
      .eq("external_variant_id", externalVariantId).maybeSingle();
    const namedVariant = externalVariant.data?.id ? null : await client.from("product_variants").select("id,image_url")
      .eq("workspace_id", job.workspace_id).eq("product_id", product.id)
      .eq("variant_name", variantName).eq("variant_value", variantName).maybeSingle();
    const variant = externalVariant.data ?? namedVariant?.data ?? null;
    if (variant?.id) {
      const updated = await client.from("product_variants").update({
        source_integration_id: job.integration_id,
        external_variant_id: externalVariantId,
        ...(variant.image_url || !item.image_url ? {} : { image_url: item.image_url }),
        provider_updated_at: new Date().toISOString(),
      }).eq("id", variant.id).eq("workspace_id", job.workspace_id);
      if (updated.error) throw new Error(`order_variant_update_failed:${updated.error.code ?? "unknown"}`);
    } else {
      const inserted = await client.from("product_variants").insert({
        workspace_id: job.workspace_id,
        product_id: product.id,
        source_integration_id: job.integration_id,
        external_variant_id: externalVariantId,
        variant_name: variantName,
        variant_value: variantName,
        sku: item.sku ?? null,
        price: Number(item.unit_price ?? 0),
        cost: 0,
        stock: 0,
        image_url: item.image_url ?? null,
        is_active: true,
        provider_updated_at: new Date().toISOString(),
      });
      if (inserted.error) throw new Error(`order_variant_insert_failed:${inserted.error.code ?? "unknown"}`);
    }
  }
  return created;
}
async function upsertOrder(client: SupabaseClient, job: any, providerOrder: any): Promise<void> {
  const mapped = mapYouCanOrder(providerOrder, job.workspace_id, job.integration_id);
  const customerLinks = await upsertCustomers(client, job, mapped.customer ? [mapped.customer as any] : []);
  const customerId = mapped.customer?.external_customer_id ? customerLinks.get(String(mapped.customer.external_customer_id)) ?? null : null;
  const orderPayload = { ...mapped.order, ...(customerId ? { customer_id: customerId } : {}) };
  const saved = await client.from("orders").upsert(orderPayload, { onConflict: "workspace_id,youcan_order_id" }).select('"Order ID"').single();
  if (saved.error || !saved.data?.["Order ID"]) throw new Error(`order_upsert_failed:${saved.error?.code ?? "no_row"}:${String(saved.error?.message ?? "unknown").slice(0, 180)}`);
  const orderId = saved.data["Order ID"];
  if (mapped.items.length) {
    const items = mapped.items.map((item) => ({ ...item, order_id: orderId }));
    const itemResult = await client.from("youcan_order_items").upsert(items, { onConflict: "workspace_id,integration_id,order_id,external_line_id" });
    if (itemResult.error) throw new Error("order_items_upsert_failed");
    await upsertProductsFromOrderItems(client, job, mapped.items);
  }
}
async function syncOrders(client: SupabaseClient, job: any, token: string): Promise<number> {
  const eventPayload = job.payload?.event_payload;
  if (eventPayload) {
    await upsertOrder(client, job, eventPayload);
    if (job.payload?.delivery_id) await client.from("youcan_webhook_deliveries").update({ status: "processed", processed_at: new Date().toISOString() }).eq("integration_id", job.integration_id).eq("delivery_id", job.payload.delivery_id);
    return 1;
  }
  const orders = await paginateYouCan(token, "/orders?include=customer,variants,payment,shipping,discount,coupon,comments,refunds,referenced_order");
  const mapped = orders.map((order) => mapYouCanOrder(order, job.workspace_id, job.integration_id));
  const customerRows = [...new Map(mapped.filter((entry) => entry.customer?.external_customer_id).map((entry) => [`${entry.customer!.external_customer_id}`, entry.customer])).values()];
  const customerByExternal = await upsertCustomers(client, job, customerRows as Record<string, any>[]);
  const orderRows = mapped.map((entry, index) => ({
    ...entry.order,
    ...(orders[index]?.customer?.id && customerByExternal.get(String(orders[index].customer.id)) ? { customer_id: customerByExternal.get(String(orders[index].customer.id)) } : {}),
  }));
  for (let offset = 0; offset < orderRows.length; offset += 50) {
    const result = await client.from("orders").upsert(orderRows.slice(offset, offset + 50), { onConflict: "workspace_id,youcan_order_id" });
    if (result.error) throw new Error(`order_batch_upsert_failed:${result.error.code ?? "unknown"}:${String(result.error.message ?? "").slice(0, 140)}`);
  }
  const externalIds = orderRows.map((row: any) => String(row.youcan_order_id));
  const orderLinks: any[] = [];
  for (let offset = 0; offset < externalIds.length; offset += 100) {
    const result = await client.from("orders").select('"Order ID",youcan_order_id').eq("workspace_id", job.workspace_id).in("youcan_order_id", externalIds.slice(offset, offset + 100));
    orderLinks.push(...(result.data ?? []));
  }
  const orderIdByExternal = new Map(orderLinks.map((row: any) => [String(row.youcan_order_id), row["Order ID"]]));
  const items = mapped.flatMap((entry, index) => entry.items.map((item) => ({ ...item, order_id: orderIdByExternal.get(String(orderRows[index].youcan_order_id)) }))).filter((item: any) => item.order_id);
  for (let offset = 0; offset < items.length; offset += 100) {
    const result = await client.from("youcan_order_items").upsert(items.slice(offset, offset + 100), { onConflict: "workspace_id,integration_id,order_id,external_line_id" });
    if (result.error) throw new Error(`order_items_batch_upsert_failed:${result.error.code ?? "unknown"}`);
  }
  await upsertProductsFromOrderItems(client, job, mapped.flatMap((entry) => entry.items));
  if (job.payload?.delivery_id) await client.from("youcan_webhook_deliveries").update({ status: "processed", processed_at: new Date().toISOString() }).eq("integration_id", job.integration_id).eq("delivery_id", job.payload.delivery_id);
  return orders.length;
}
async function syncProducts(client: SupabaseClient, job: any, token: string): Promise<number> {
  const products = await paginateYouCan(token, "/products?include=variants,categories,vendors,images");
  for (const product of products) {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const primary = variants[0] ?? {};
    const inventory = Number(product?.inventory ?? product?.stock ?? variants.reduce((sum: number, item: any) => sum + Number(item?.inventory ?? item?.stock ?? 0), 0));
    const image = product?.thumbnail ?? product?.images?.[0]?.url ?? product?.images?.[0]?.src ?? null;
    const externalId = String(product?.id ?? "").trim();
    if (!externalId) continue;
    const row = {
      workspace_id: job.workspace_id, source_integration_id: job.integration_id, external_product_id: externalId,
      youcan_product_id: externalId, name: String(product?.name ?? "YouCan product"), sku: primary?.sku ?? product?.sku ?? null,
      price: Number(primary?.price ?? product?.price ?? 0), cost: Number(primary?.cost ?? product?.cost ?? 0),
      stock: inventory, initial_stock: inventory, provider_inventory: inventory,
      inventory_tracking_enabled: Boolean(product?.track_inventory ?? product?.inventory_tracking_enabled),
      barcode: primary?.barcode ?? product?.barcode ?? null, compare_at_price: Number(primary?.compare_at_price ?? product?.compare_at_price ?? 0) || null,
      weight: Number(product?.weight ?? 0) || null, weight_unit: product?.weight_unit ?? null,
      vendor: product?.vendor?.name ?? product?.vendor ?? null, image_url: image, description: product?.description ?? null,
      category: product?.categories?.[0]?.name ?? null, currency: product?.currency ?? null,
      status: product?.is_active === false ? "inactive" : "active", provider_published: product?.is_active ?? null,
      variant_count: variants.length, product_type: variants.length > 1 ? "variant" : "simple",
      provider_updated_at: product?.updated_at ?? new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    const existingExternal = await client.from("products").select("id,youcan_product_id,source_integration_id,inventory_metadata").eq("workspace_id", job.workspace_id).eq("youcan_product_id", externalId).maybeSingle();
    let existingId = existingExternal.data?.id ?? null;
    let existingProduct = existingExternal.data ?? null;
    if (!existingId && row.sku) {
      const existingSku = await client.from("products").select("id,youcan_product_id,source_integration_id,inventory_metadata").eq("workspace_id", job.workspace_id).eq("sku", row.sku).maybeSingle();
      if (existingSku.data?.id && !existingSku.data.youcan_product_id) { existingId = existingSku.data.id; existingProduct = existingSku.data; }
      else if (existingSku.data?.id) row.sku = null;
    }
    const currentInventoryMetadata = existingProduct?.inventory_metadata && typeof existingProduct.inventory_metadata === "object" ? existingProduct.inventory_metadata : {};
    const inventorySource = currentInventoryMetadata.inventory_source ?? (existingProduct?.source_integration_id === job.integration_id ? "youcan" : "ecom_os");
    const productPayload: Record<string, any> = {
      ...row,
      inventory_metadata: { ...currentInventoryMetadata, inventory_source: inventorySource, provider_stock_at_sync: inventory },
    };
    if (existingId && inventorySource !== "youcan") {
      delete productPayload.stock;
      delete productPayload.initial_stock;
    }
    const saved = existingId
      ? await client.from("products").update(productPayload).eq("id", existingId).eq("workspace_id", job.workspace_id).select("id").single()
      : await client.from("products").insert({ ...productPayload, inventory_metadata: { ...productPayload.inventory_metadata, inventory_source: "youcan" } }).select("id").single();
    if (saved.error || !saved.data?.id) throw new Error("product_upsert_failed");
    for (const [index, variant] of variants.entries()) {
      const variantId = String(variant?.id ?? "").trim();
      if (!variantId) continue;
      const values = Array.isArray(variant?.values) ? variant.values : [];
      const variantName = values.map((value: any) => typeof value === "string" ? value : value?.name ?? value?.value).filter(Boolean).join(" / ") || variant?.name || `Variant ${index + 1}`;
      const variantInventory = Number(variant?.inventory ?? variant?.stock ?? 0);
      const variantRow = {
        workspace_id: job.workspace_id, product_id: saved.data.id, source_integration_id: job.integration_id,
        external_variant_id: variantId, variant_name: variantName, variant_value: variantName,
        sku: variant?.sku ?? null, barcode: variant?.barcode ?? null, price: Number(variant?.price ?? 0), cost: Number(variant?.cost ?? 0),
        stock: variantInventory, provider_inventory: variantInventory, image_url: variant?.image?.url ?? image,
        is_active: variant?.is_active !== false, provider_updated_at: variant?.updated_at ?? product?.updated_at ?? new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      const externalVariant = await client.from("product_variants").select("id").eq("workspace_id", job.workspace_id).eq("source_integration_id", job.integration_id).eq("external_variant_id", variantId).maybeSingle();
      const namedVariant = externalVariant.data?.id ? null : await client.from("product_variants").select("id").eq("workspace_id", job.workspace_id).eq("product_id", saved.data.id).eq("variant_name", variantName).eq("variant_value", variantName).maybeSingle();
      const existingVariantId = externalVariant.data?.id ?? namedVariant?.data?.id ?? null;
      const result = existingVariantId
        ? await client.from("product_variants").update((({ stock: _stock, ...safeProviderFields }) => safeProviderFields)(variantRow)).eq("id", existingVariantId).eq("workspace_id", job.workspace_id)
        : await client.from("product_variants").insert(variantRow);
      if (result.error) throw new Error(`product_variant_upsert_failed:${result.error.code ?? "unknown"}:${String(result.error.message ?? "").slice(0, 140)}`);
    }
  }
  return products.length;
}
async function syncFinance(client: SupabaseClient, job: any, token: string): Promise<number> {
  const store = await youcanRequest(token, "/me");
  const domain = String(store?.domain ?? "").trim() || null;
  const slug = String(store?.slug ?? "").trim() || null;
  const result = await client.from("youcan_financial_snapshots").insert({
    workspace_id: job.workspace_id, integration_id: job.integration_id,
    currency: store?.currency?.code ?? store?.currency ?? null, balance: Number(store?.balance ?? 0),
    due_amount: Number(store?.due_amount ?? 0), unpaid_invoices_amount: Number(store?.unpaid_invoices_amount ?? 0),
    provider_store_status: store?.status_text ?? store?.status ?? null,
  });
  if (result.error) throw new Error("finance_snapshot_failed");
  await client.from("integrations").update({
    external_store_id: store?.store_id ?? store?.id ?? null,
    store_name: store?.name ?? slug ?? "YouCan Store",
    store_slug: slug,
    store_domain: domain,
    store_public_url: domain ? (domain.startsWith("http") ? domain : `https://${domain}`) : (slug ? `https://${slug}.youcan.store` : null),
    store_logo_url: store?.logo ?? null,
    store_currency: store?.currency?.code ?? store?.currency ?? null,
    provider_store_status: store?.status_text ?? store?.status ?? null,
    provider_store_active: store?.is_active ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", job.integration_id);
  return 1;
}
async function syncStatus(client: SupabaseClient, job: any, token: string): Promise<number> {
  const externalId = String(job.payload?.external_order_id ?? "");
  if (!externalId) throw new Error("status_job_invalid");
  const status = String(job.payload?.status ?? "pending").toLowerCase();
  const general = youCanGeneralStatus(status);
  if (!general) {
    await client.from("orders").update({
      youcan_status_sync_error: `Unsupported by YouCan: ${status}`,
      youcan_sync_origin: "ecom_os",
    }).eq("workspace_id", job.workspace_id).eq("youcan_order_id", externalId);
    return 0;
  }
  await youcanRequest(token, `/orders/${encodeURIComponent(externalId)}/status`, { method: "PUT", body: JSON.stringify({ status: general }) });
  const shippingRaw = String(job.payload?.shipping_status ?? "").toLowerCase();
  if (shippingRaw) {
    const shipping = youCanShippingStatus(shippingRaw);
    if (shipping) await youcanRequest(token, `/orders/${encodeURIComponent(externalId)}/status/shipping`, { method: "PUT", body: JSON.stringify({ status: shipping }) });
  }
  await client.from("orders").update({ youcan_status_synced_at: new Date().toISOString(), youcan_status_sync_error: null, youcan_sync_origin: "ecom_os" }).eq("workspace_id", job.workspace_id).eq("youcan_order_id", externalId);
  return 1;
}
async function completeJob(client: SupabaseClient, job: any, ok: boolean, error?: string): Promise<void> {
  if (ok) {
    await client.from("youcan_sync_jobs").update({ status: "completed", completed_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
  } else {
    const terminal = Number(job.attempts) >= Number(job.max_attempts);
    const delayMinutes = Math.min(60, 2 ** Math.max(0, Number(job.attempts) - 1));
    await client.from("youcan_sync_jobs").update({ status: terminal ? "failed" : "retry", available_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(), locked_at: null, locked_by: null, last_error: error ?? "job_failed", updated_at: new Date().toISOString() }).eq("id", job.id);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supplied = req.headers.get("x-youcan-cron-secret")?.trim() ?? "";
  if (!supplied || !equalSecret(supplied, requiredYouCanEnv("YOUCAN_CRON_SECRET"))) return json({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const urgentJobId = typeof body.job_id === "string" ? body.job_id.trim() : "";
  if (urgentJobId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(urgentJobId)) {
    return json({ error: "Invalid job" }, 400);
  }
  const client = createClient(requiredYouCanEnv("SUPABASE_URL"), requiredYouCanEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const workerId = crypto.randomUUID();
  let claimed: { data: any[] | null; error: any };
  if (urgentJobId) {
    const pending = await client.from("youcan_sync_jobs").select("*").eq("id", urgentJobId)
      .eq("job_type", "orders").in("status", ["pending", "retry"]).maybeSingle();
    if (pending.error) return json({ error: "Queue unavailable" }, 503);
    if (!pending.data) return json({ success: true, claimed: 0, completed: 0, retried: 0 });
    const updated = await client.from("youcan_sync_jobs").update({
      status: "processing", attempts: Number(pending.data.attempts) + 1,
      locked_at: new Date().toISOString(), locked_by: workerId, updated_at: new Date().toISOString(),
    }).eq("id", urgentJobId).eq("attempts", pending.data.attempts).in("status", ["pending", "retry"]).select("*").maybeSingle();
    claimed = { data: updated.data ? [updated.data] : [], error: updated.error };
  } else {
    await client.rpc("configure_youcan_cron_v2", {
      p_function_url: `${requiredYouCanEnv("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/youcan-reconcile`,
      p_cron_secret: requiredYouCanEnv("YOUCAN_CRON_SECRET"),
    });
    await client.rpc("install_youcan_cron_jobs_v2");
    await client.from("youcan_sync_jobs").update({ status: "retry", locked_at: null, locked_by: null, available_at: new Date().toISOString(), last_error: "stale_worker_recovered" })
      .eq("status", "processing").lt("locked_at", new Date(Date.now() - 10 * 60_000).toISOString());
    const { data: activeIntegrations } = await client.from("integrations").select("id,workspace_id").eq("provider", "youcan").eq("status", "active");
    const hour = new Date().toISOString().slice(0, 13);
    const day = new Date().toISOString().slice(0, 10);
    for (const integration of activeIntegrations ?? []) {
      for (const [jobType, bucket] of [["orders", hour], ["products", hour], ["finance", hour], ["webhook_repair", day]] as const) {
        await client.from("youcan_sync_jobs").upsert({
          workspace_id: integration.workspace_id, integration_id: integration.id, job_type: jobType,
          idempotency_key: `scheduled:${bucket}:${jobType}`, payload: {}, status: "pending", available_at: new Date().toISOString(),
        }, { onConflict: "workspace_id,integration_id,job_type,idempotency_key", ignoreDuplicates: true });
      }
    }
    claimed = await client.rpc("claim_youcan_sync_jobs", { p_worker: workerId, p_limit: 10 });
  }
  if (claimed.error) return json({ error: "Queue unavailable" }, 503);
  let completed = 0, retried = 0;
  for (const job of claimed.data ?? []) {
    try {
      const { token } = await integrationAccessToken(client, job.integration_id);
      if (job.job_type === "orders" || job.job_type === "initial_backfill") await syncOrders(client, job, token);
      else if (job.job_type === "products") await syncProducts(client, job, token);
      else if (job.job_type === "checkout_fields") {
        // Historical optional jobs are completed without calling the unsupported checkout-fields API.
      }
      else if (job.job_type === "finance") await syncFinance(client, job, token);
      else if (job.job_type === "webhook_repair") await ensureYouCanWebhooks(client, job.integration_id, job.workspace_id, token);
      else if (job.job_type === "status_outbound") await syncStatus(client, job, token);
      await completeJob(client, job, true);
      await Promise.all([
        client.from("integrations").update({ last_full_sync_at: new Date().toISOString() }).eq("id", job.integration_id),
        client.from("integration_sync_state").update({ last_success_at: new Date().toISOString(), last_sync_completed_at: new Date().toISOString(), consecutive_failures: 0, last_error: null, updated_at: new Date().toISOString() }).eq("workspace_id", job.workspace_id).eq("provider", "youcan"),
      ]);
      completed += 1;
    } catch (error) {
      const safe = error instanceof Error ? error.message : "job_failed";
      console.error("[YouCan reconcile] job_failed", job.id, job.job_type, safe);
      if (safe.includes("authorization expired")) {
        await client.from("integrations").update({ status: "auth_expired", needs_reconnect: true, webhook_health: "auth_expired" }).eq("id", job.integration_id);
      } else if (safe.includes("permission is missing")) {
        await client.from("integrations").update({ status: "degraded", needs_reconnect: true, webhook_health: "degraded" }).eq("id", job.integration_id);
      }
      await completeJob(client, job, false, safe); retried += 1;
    }
  }
  return json({ success: true, claimed: (claimed.data ?? []).length, completed, retried });
});
