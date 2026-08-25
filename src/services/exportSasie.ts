import writeXlsxFile from "write-excel-file/browser";
import type { Order } from "../lib/types";

function safeStringField(order: Order, key: string): string {
  const record = order as unknown as Record<string, unknown>;
  const val = record[key];
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  return "";
}

function buildProductCell(order: Order): string {
  const record = order as unknown as Record<string, unknown>;
  const items = Array.isArray(record["order_items"]) ? (record["order_items"] as Array<Record<string, unknown>>) : [];
  if (items.length > 0) {
    const parts = items.map((it) => {
      const qty = Number(it.quantity ?? 1) || 1;
      const prod = (it.products && (it.products as Record<string, unknown>).name) || (order as unknown as Record<string, unknown>)["product_variant"] || (order as unknown as Record<string, unknown>)["sku"] || "";
      const name = typeof prod === "string" ? prod : String(prod);
      return `${name}${qty > 1 ? ` x${qty}` : qty === 1 ? ` x1` : ``}`.trim();
    }).filter(Boolean);
    return parts.join(" | ");
  }

  // Fallback: try product_variant or sku
  const pv = (order as unknown as Record<string, unknown>)["product_variant"] as string | undefined;
  const sku = (order as unknown as Record<string, unknown>)["sku"] as string | undefined;
  if (pv) return pv;
  if (sku) return sku;
  return "";
}

export async function exportOrdersToSasie(orders: Order[]): Promise<string[]> {
  // expects orders already filtered to exact set to export
  if (!orders || orders.length === 0) return [];

  const headers = [
    "CODE SUIVI",
    "DESTINATAIRE",
    "TELEPHONE",
    "ADRESSE",
    "PRIX",
    "VILLE",
    "COMMENTAIRE",
    "QUARTIER",
    "PRODUIT",
  ];

  const aoa: Array<Array<string | number>> = [headers];

  for (const order of orders) {
    const codeSuivi = (() => {
      // Use existing order code from DB and prepend one '#'
      const code = (order as unknown as Record<string, unknown>)["order_number"] as string | undefined;
      if (code && code.length > 0) {
        if (code.startsWith("##")) return code; // already has two hashes
        if (code.startsWith("#")) return `#${code}`; // prepend one '#'
        return `##${code}`;
      }
      // Fallback to tracking number if order_number missing
      return order.tracking_number ?? "";
    })();

    const destinataire = order.customer?.name ?? "";
    const telephone = order.phone ?? order.customer?.phone ?? "";
    const adresse = order.address ?? "";
    const prix = Number(order.total ?? 0) || 0;
    const ville = order.city ?? "";
    const commentaire = safeStringField(order, "customer_note");
    const quartier = safeStringField(order, "district");
    const produit = buildProductCell(order) || "";

    aoa.push([codeSuivi, destinataire, telephone, adresse, prix, ville, commentaire, quartier, produit]);
  }

  // Auto-width
  const colWidths = aoa[0].map((_, colIndex) => {
    let max = 10;
    for (let r = 0; r < aoa.length; r++) {
      const cell = aoa[r][colIndex];
      const len = cell === null || cell === undefined ? 0 : String(cell).length;
      if (len > max) max = len;
    }
    return { width: Math.min(Math.max(max + 2, 10), 60) };
  });

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const filename = `SASIE_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.xlsx`;

  await writeXlsxFile(aoa, {
    sheet: "Colis",
    columns: colWidths,
  }).toFile(filename);

  // return exported order ids
  return orders.map((o) => o.id).filter(Boolean) as string[];
}

export default exportOrdersToSasie;
