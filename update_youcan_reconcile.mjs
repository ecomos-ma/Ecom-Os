import fs from 'fs';

let content = fs.readFileSync('./supabase/functions/youcan-reconcile/index.ts', 'utf8');

const importTarget = `import { ensureYouCanWebhooks, integrationAccessToken, mapYouCanOrder, paginateYouCan, requiredYouCanEnv, youcanRequest, youCanGeneralStatus, youCanShippingStatus } from "../_shared/youcan.ts";`;
const importReplacement = `import { ensureYouCanWebhooks, integrationAccessToken, mapYouCanOrder, paginateYouCan, requiredYouCanEnv, youcanRequest, youCanGeneralStatus, youCanShippingStatus } from "../_shared/youcan.ts";\nimport { resolveOrderCityFuzzy } from "../_shared/city-matcher.ts";`;

const upsertTarget = `async function upsertOrder(client: SupabaseClient, job: any, providerOrder: any): Promise<void> {
  const mapped = mapYouCanOrder(providerOrder, job.workspace_id, job.integration_id);
  const customerLinks = await upsertCustomers(client, job, mapped.customer ? [mapped.customer as any] : []);
  const customerId = mapped.customer?.external_customer_id ? customerLinks.get(String(mapped.customer.external_customer_id)) ?? null : null;
  const orderPayload = { ...mapped.order, ...(customerId ? { customer_id: customerId } : {}) };`;

const upsertReplacement = `async function upsertOrder(client: SupabaseClient, job: any, providerOrder: any): Promise<void> {
  const mapped = mapYouCanOrder(providerOrder, job.workspace_id, job.integration_id);
  const customerLinks = await upsertCustomers(client, job, mapped.customer ? [mapped.customer as any] : []);
  const customerId = mapped.customer?.external_customer_id ? customerLinks.get(String(mapped.customer.external_customer_id)) ?? null : null;

  if (mapped.order.city || mapped.order.raw_city) {
    try {
      const workspaceRes = await client.from("workspaces").select("carrier").eq("id", job.workspace_id).maybeSingle();
      const carrier = workspaceRes.data?.carrier || "ozon";
      const resolvedCity = await resolveOrderCityFuzzy(client, String(mapped.order.raw_city || mapped.order.city), carrier);
      if (resolvedCity.city_mapping_status === 'resolved') {
        mapped.order.ozon_city_id = resolvedCity.ozon_city_id;
        mapped.order.provider_city_id = resolvedCity.provider_city_id;
        mapped.order.city_name = resolvedCity.city_name;
        mapped.order.city = resolvedCity.city_name;
        mapped.order.city_mapping_status = 'resolved';
        mapped.order.city_mapping_confidence = resolvedCity.city_mapping_confidence;
      } else {
        mapped.order.city_mapping_status = 'unresolved';
        mapped.order.city_mapping_confidence = resolvedCity.city_mapping_confidence;
      }
    } catch {
      // Fallback cleanly if city lookup fails
    }
  }

  const orderPayload = { ...mapped.order, ...(customerId ? { customer_id: customerId } : {}) };`;

content = content.replace(importTarget, importReplacement);
content = content.replace(upsertTarget, upsertReplacement);

fs.writeFileSync('./supabase/functions/youcan-reconcile/index.ts', content);
console.log("✅ Updated youcan-reconcile/index.ts with fuzzy city resolution");
