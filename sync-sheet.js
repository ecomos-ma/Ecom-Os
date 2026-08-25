import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://your-project.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "your-service-role-key";
const sheetUrl =
  "google sheet url";

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ── helpers ───────────────────────────────────────────────────────────────────

function safeDate(raw) {
  try {
    const dateStr = String(raw).trim();
    const match = dateStr.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (match) {
      const d = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
      if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(raw);
    return isNaN(d.getTime()) ? new Date("2026-01-01T00:00:00Z") : d;
  } catch {
    return new Date("2026-01-01T00:00:00Z");
  }
}

function orderKey(date, idx) {
  const clean = date.toISOString().replace(/\D/g, "").slice(0, 8);
  return `#GS-${clean}-${idx + 1}`;
}

// ── probe what columns exist on the orders table ──────────────────────────────

async function probeColumns() {
  // Fetch one row (if any) and see which keys come back
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .limit(1);

  if (error) {
    // Table may be completely empty and returns no error in that case,
    // but PGRST errors mean the table itself has issues.
    console.error("Could not probe orders table:", error.message);
    return null;
  }

  // If there are rows, return the keys of the first row
  if (data && data.length > 0) {
    return Object.keys(data[0]);
  }

  // Table exists but is empty — try a known-safe minimal insert and read back
  // columns from the error message.  Fall back to a safe default set.
  return ["Order ID", "order_number", "city", "total", "status", "created_at"];
}

// ── try to upsert a customer, return id or null ───────────────────────────────

async function upsertCustomer(name, phone, city, hasCustomersTable) {
  if (!hasCustomersTable) return null;
  if (!name) return null;

  if (phone) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("customers")
        .update({ name, city })
        .eq("id", existing.id);
      return existing.id;
    }

    const { data: created, error } = await supabase
      .from("customers")
      .insert({ name, phone, city })
      .select("id")
      .single();

    if (error) {
      // duplicate phone race — try fetching again
      const { data: retry } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();
      return retry?.id ?? null;
    }
    return created?.id ?? null;
  } else {
    // No phone — insert without unique constraint
    const { data: created } = await supabase
      .from("customers")
      .insert({ name, phone: null, city })
      .select("id")
      .single();
    return created?.id ?? null;
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log("Fetching orders from Google Sheets…");
  const res = await fetch(sheetUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching sheet`);

  const raw = await res.json();
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error("Unexpected sheet format");
  }

  const rows = raw.slice(1); // skip header row
  console.log(`Sheet has ${rows.length} data rows.`);

  // Probe existing schema
  const columns = await probeColumns();
  console.log("Detected order columns:", columns);
  const hasCustomerId = columns && columns.includes("customer_id");

  // Check if customers table is accessible
  let hasCustomersTable = false;
  if (hasCustomerId) {
    const { error: custProbe } = await supabase
      .from("customers")
      .select("id")
      .limit(1);
    hasCustomersTable = !custProbe;
    console.log("customers table reachable:", hasCustomersTable);
  }

  // 1. Find the highest order index (row suffix) in the database
  const { data: existingOrders } = await supabase
    .from("orders")
    .select("order_number")
    .like("order_number", "#GS-%");

  let maxRowIndex = 0;
  if (existingOrders) {
    for (const ord of existingOrders) {
      const parts = ord.order_number.split("-");
      const lastPart = parts[parts.length - 1];
      const rowNum = parseInt(lastPart, 10);
      if (!isNaN(rowNum) && rowNum > maxRowIndex) {
        maxRowIndex = rowNum;
      }
    }
  }

  // 2. Filter rows to only keep those newer than maxRowIndex
  const newItems = rows
    .map((row, index) => ({ row, sheetIndex: index + 1 }))
    .filter((item) => item.sheetIndex > maxRowIndex);

  let synced = 0;
  let skipped = rows.length - newItems.length;
  let failed = 0;

  for (let k = 0; k < newItems.length; k++) {
    const { row, sheetIndex } = newItems[k];
    if (!row || row.length === 0) { skipped++; continue; }

    // Map sheet columns
    const orderDate      = row[0];
    const customerName   = String(row[1] ?? "").trim();
    let   phone          = row[2] != null ? String(row[2]).trim() : null;
    const city           = String(row[3] ?? "").trim();
    const variantPrice   = Number(row[4] ?? 0);
    const sku            = String(row[5] ?? "").trim();
    const customerIp     = String(row[6] ?? "").trim();
    const productVariant = String(row[7] ?? "").trim();

    if (!customerName) { skipped++; continue; }
    if (phone === "" || phone?.toLowerCase() === "null") phone = null;

    const parsedDate  = safeDate(orderDate);
    const orderNumber = orderKey(parsedDate, sheetIndex - 1);

    process.stdout.write(`[${k + 1}/${newItems.length}] ${orderNumber} — ${customerName}… `);

    // Resolve city and calculate shipping cost using Smart Pricing Engine
    let ozonCityId = null;
    let cityName = city || null;
    let shippingCost = null;

    if (city) {
      const normalizedCity = city.trim().toLowerCase();
      
      // Try exact match on ozon_cities.name
      const { data: exactCity } = await supabase
        .from("ozon_cities")
        .select("id, name, delivered_price")
        .ilike("name", normalizedCity)
        .limit(1);
      
      if (exactCity && exactCity.length > 0) {
        ozonCityId = exactCity[0].id;
        cityName = exactCity[0].name;
        shippingCost = exactCity[0].delivered_price;
      } else {
        // Try alias match
        const { data: aliasMatch } = await supabase
          .from("city_aliases")
          .select("ozon_city_id")
          .eq("alias", normalizedCity)
          .limit(1);
        
        if (aliasMatch && aliasMatch.length > 0) {
          const { data: cityData } = await supabase
            .from("ozon_cities")
            .select("id, name, delivered_price")
            .eq("id", aliasMatch[0].ozon_city_id)
            .single();
          
          if (cityData) {
            ozonCityId = cityData.id;
            cityName = cityData.name;
            shippingCost = cityData.delivered_price;
          }
        }
      }
      
      // Priority 2: Fallback to business delivery fee if no provider pricing
      if (shippingCost === null) {
        const { data: workspaceData } = await supabase
          .from("workspaces")
          .select("business_delivery_fee")
          .eq("id", wid)
          .single();
        shippingCost = workspaceData?.business_delivery_fee || 35;
      }
    }

    // Resolve customer
    let customerId = null;
    if (hasCustomerId && hasCustomersTable) {
      customerId = await upsertCustomer(customerName, phone, cityName, hasCustomersTable);
    }

    // Build order payload
    const orderPayload = {
      order_number:    orderNumber,
      city:            cityName || null,
      ozon_city_id:    ozonCityId || null,
      city_name:       cityName || null,
      total:           variantPrice,
      status:          "pending",
      created_at:      parsedDate.toISOString(),
      phone:           phone || null,
      variant_price:   variantPrice,
      sku:             sku || null,
      customer_ip:     customerIp || null,
      product_variant: productVariant || null,
      shipping_cost:   shippingCost,
    };

    if (hasCustomerId && customerId) {
      orderPayload.customer_id = customerId;
    }

    const { error: ordErr } = await supabase
      .from("orders")
      .insert(orderPayload);

    if (ordErr) {
      console.log(`FAILED — ${ordErr.message}`);
      failed++;
    } else {
      console.log("OK");
      synced++;
    }
  }

  console.log(`\n✅ Done. synced=${synced}  skipped=${skipped}  failed=${failed}`);
}

run().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
