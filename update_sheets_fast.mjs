import fs from 'fs';

// 1. Update sync-google-sheets-fast/index.ts
let contentFast = fs.readFileSync('./supabase/functions/sync-google-sheets-fast/index.ts', 'utf8');

if (!contentFast.includes('city-matcher.ts')) {
  contentFast = `import { resolveOrderCityFuzzy } from "../_shared/city-matcher.ts";\n` + contentFast;
}

const targetFast = `      const orderPayload = mapWebAppRow(row, workspaceId, fieldMappings, customStatusMappings);`;
const replacementFast = `      const orderPayload = mapWebAppRow(row, workspaceId, fieldMappings, customStatusMappings);
      if (orderPayload.city || orderPayload.raw_city) {
        try {
          const workspaceRes = await supabase.from("workspaces").select("carrier").eq("id", workspaceId).maybeSingle();
          const carrier = workspaceRes.data?.carrier || "ozon";
          const resolvedCity = await resolveOrderCityFuzzy(supabase, String(orderPayload.raw_city || orderPayload.city), carrier);
          if (resolvedCity.city_mapping_status === 'resolved') {
            orderPayload.ozon_city_id = resolvedCity.ozon_city_id;
            orderPayload.provider_city_id = resolvedCity.provider_city_id;
            orderPayload.city_name = resolvedCity.city_name;
            orderPayload.city = resolvedCity.city_name;
            orderPayload.city_mapping_status = 'resolved';
            orderPayload.city_mapping_confidence = resolvedCity.city_mapping_confidence;
          } else {
            orderPayload.city_mapping_status = 'unresolved';
          }
        } catch {}
      }`;

contentFast = contentFast.replace(targetFast, replacementFast);
fs.writeFileSync('./supabase/functions/sync-google-sheets-fast/index.ts', contentFast);
console.log("✅ Updated sync-google-sheets-fast/index.ts with fuzzy city resolution");

// 2. Update sync-google-sheets-orders/index.ts
let contentOrders = fs.readFileSync('./supabase/functions/sync-google-sheets-orders/index.ts', 'utf8');

if (!contentOrders.includes('city-matcher.ts')) {
  contentOrders = `import { resolveOrderCityFuzzy } from "../_shared/city-matcher.ts";\n` + contentOrders;
}

const targetOrders = `        const orderPayload = mapWebAppRow(row, workspace_id, fieldMappings, customStatusMappings);`;
const replacementOrders = `        const orderPayload = mapWebAppRow(row, workspace_id, fieldMappings, customStatusMappings);
        if (orderPayload.city || orderPayload.raw_city) {
          try {
            const workspaceRes = await supabase.from("workspaces").select("carrier").eq("id", workspace_id).maybeSingle();
            const carrier = workspaceRes.data?.carrier || "ozon";
            const resolvedCity = await resolveOrderCityFuzzy(supabase, String(orderPayload.raw_city || orderPayload.city), carrier);
            if (resolvedCity.city_mapping_status === 'resolved') {
              orderPayload.ozon_city_id = resolvedCity.ozon_city_id;
              orderPayload.provider_city_id = resolvedCity.provider_city_id;
              orderPayload.city_name = resolvedCity.city_name;
              orderPayload.city = resolvedCity.city_name;
              orderPayload.city_mapping_status = 'resolved';
              orderPayload.city_mapping_confidence = resolvedCity.city_mapping_confidence;
            } else {
              orderPayload.city_mapping_status = 'unresolved';
            }
          } catch {}
        }`;

contentOrders = contentOrders.replace(targetOrders, replacementOrders);
fs.writeFileSync('./supabase/functions/sync-google-sheets-orders/index.ts', contentOrders);
console.log("✅ Updated sync-google-sheets-orders/index.ts with fuzzy city resolution");
