const VARIABLE_PATTERN = /{{\s*([a-z_]+)\s*}}/gi;

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(number % 1 ? 2 : 0) : String(value || "");
}

function productSummary(order) {
  const value = order.products ?? order.items ?? order.line_items ?? order["Line Items"];
  if (Array.isArray(value)) {
    return value.map((item) => `• ${item.name || item.title || item.product_name || "Product"} × ${item.quantity || item.qty || 1}`).join("\n");
  }
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return Object.values(value).join("\n");
  return order.product_name || order.product || "";
}

export function templateVariables(order, workspace = {}, now = new Date()) {
  return {
    customer_name: order.customer_name || order.name || order.full_name || "",
    order_number: order.order_number || order.order_no || order.reference || order["Order ID"] || "",
    order_id: order["Order ID"] || order.id || "",
    products: productSummary(order),
    product_summary: productSummary(order),
    total: money(order.total ?? order.total_price ?? order.amount),
    city: order.city || order.city_name || order.raw_city || "",
    phone: order.phone || "",
    address: order.address || order.shipping_address || "",
    shipping_company: order.shipping_company || order.delivery_company || order.provider || "",
    tracking_number: order.tracking_number || order.tracking_code || order.tracking_id || "",
    workspace_name: workspace.name || "",
    status: order.shipping_status || order.delivery_status || order.status || "",
    current_date: new Intl.DateTimeFormat("fr-MA", { dateStyle: "medium", timeZone: "Africa/Casablanca" }).format(now),
    current_time: new Intl.DateTimeFormat("fr-MA", { timeStyle: "short", timeZone: "Africa/Casablanca" }).format(now),
  };
}

export function renderTemplate(template, variables) {
  return String(template || "").replace(VARIABLE_PATTERN, (_match, key) => {
    const result = variables[String(key).toLowerCase()];
    return result === null || result === undefined ? "" : String(result);
  }).trim();
}
