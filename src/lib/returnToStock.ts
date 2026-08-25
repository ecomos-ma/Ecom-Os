import { supabase } from "./supabase";

// ── Returnable status normalization ────────────────────────────────────────────

const RETURNABLE_STATUSES = [
    "coming_back",
    "coming back",
    "retour",
    "returned",
    "returned_to_sender",
    "return_in_transit",
    "return in transit",
    "returned_to_warehouse",
    "returned to warehouse",
    "returned_to_agency",
    "returned to agency",
    "return_in_progress",
    "return in progress",
    "delivery_failed",
    "delivery failed",
    "delivery_failed_returning",
    "refused",
    "refusé",
    "refusee",
    "rejected",
];

export function isReturnableStatus(raw: string | null | undefined): boolean {
    if (!raw) return false;
    const lower = raw.trim().toLowerCase();
    return RETURNABLE_STATUSES.some(s => lower === s || lower.includes(s.split("_")[0]));
}

export function normalizeDisplayStatus(raw: string | null | undefined): string {
    if (!raw) return "Unknown";
    const lower = raw.trim().toLowerCase();
    if (lower.includes("coming_back") || lower.includes("coming back")) return "Coming Back";
    if (lower.includes("refused") || lower.includes("refus")) return "Refused";
    if (lower.includes("return_in_progress") || lower.includes("return in progress")) return "Return In Progress";
    if (lower.includes("returned_to_sender") || lower.includes("returned to sender")) return "Returned To Sender";
    if (lower.includes("returned_to_agency") || lower.includes("returned to agency")) return "Returned To Agency";
    if (lower.includes("returned_to_warehouse") || lower.includes("returned to warehouse")) return "Returned To Warehouse";
    if (lower.includes("return")) return "Returning";
    if (lower.includes("delivery_failed") || lower.includes("delivery failed")) return "Delivery Failed";
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReturnItem {
    product_id: string | null;
    sku: string | null;
    name: string;
    variant: string | null;
    quantity: number;
    image_url: string | null;
    current_stock: number | null;
}

export interface ReturnToStockResult {
    success: boolean;
    error?: string;
    tracking: string;
    productName: string;
    qty: number;
    alreadyReturned?: boolean;
    notEligible?: boolean;
    newStock?: number;
}

// ── Load order items for return ───────────────────────────────────────────────

export async function loadOrderItems(orderId: string, orderSku: string | null, orderQuantity: number | null, orderVariant: string | null, workspaceId?: string): Promise<ReturnItem[]> {
    console.log("[RETURN TO STOCK] Load order items", {
        orderId,
        orderSku,
        orderQuantity,
        orderVariant,
        workspaceId
    });

    let items: ReturnItem[] = [];

    // Try order_items first - note: order_items uses order_id as text (Order ID), not uuid
    console.log("[RETURN TO STOCK] Query order_items by order_id", { orderId });

    const { data: oiData, error: oiError } = await supabase
        .from("order_items")
        .select(`
            product_id, quantity,
            products:product_id (
                id, name, sku, image_url, returned_stock, initial_stock
            )
        `)
        .eq("order_id", orderId);

    if (oiError) {
        console.error("[RETURN TO STOCK ERROR] order_items query failed:", {
            message: oiError.message,
            code: oiError.code,
            details: oiError.details,
            hint: oiError.hint
        });
    }

    console.log("[RETURN TO STOCK] order_items result", {
        count: oiData?.length || 0,
        data: oiData
    });

    if (oiData && oiData.length > 0) {
        items = oiData.map((oi: any) => {
            const p = oi.products;
            const currentStock = (Number(p?.initial_stock || 0) + Number(p?.returned_stock || 0));
            return {
                product_id: oi.product_id,
                sku: p?.sku ?? null,
                name: p?.name ?? "Unknown Product",
                variant: orderVariant ?? null,
                quantity: Number(oi.quantity) || 1,
                image_url: p?.image_url ?? null,
                current_stock: currentStock,
            };
        });
        console.log("[RETURN TO STOCK] ✓ Loaded items from order_items", { count: items.length });
    } else if (orderSku) {
        // Fallback: look up by SKU
        console.log("[RETURN TO STOCK] Fallback: Query products by SKU", { orderSku, workspaceId });

        let query = supabase
            .from("products")
            .select("id, name, sku, image_url, returned_stock, initial_stock")
            .eq("sku", orderSku);

        if (workspaceId) {
            query = query.eq("workspace_id", workspaceId);
        }

        const { data: prodData, error: prodError } = await query.maybeSingle();

        if (prodError) {
            console.error("[RETURN TO STOCK ERROR] products query failed:", {
                message: prodError.message,
                code: prodError.code,
                details: prodError.details,
                hint: prodError.hint
            });
        }

        console.log("[RETURN TO STOCK] products result", { data: prodData });

        if (prodData) {
            const currentStock = (Number(prodData.initial_stock || 0) + Number(prodData.returned_stock || 0));
            items = [{
                product_id: prodData.id,
                sku: prodData.sku,
                name: prodData.name,
                variant: orderVariant ?? null,
                quantity: Number(orderQuantity) || 1,
                image_url: prodData.image_url ?? null,
                current_stock: currentStock,
            }];
            console.log("[RETURN TO STOCK] ✓ Loaded item from products fallback");
        }
    }

    console.log("[RETURN TO STOCK] Final items loaded", { count: items.length, items });
    return items;
}

// ── Execute return to stock ─────────────────────────────────────────────────────

export async function executeReturnToStock(
    orderId: string,
    items: ReturnItem[],
    tracking: string,
    workspaceId: string
): Promise<ReturnToStockResult> {
    try {
        console.log("[RETURN TO STOCK] START", {
            orderId,
            tracking,
            workspaceId,
            itemCount: items.length
        });

        let totalQty = 0;
        let lastNewStock: number | null = null;
        let productName = items[0]?.name ?? "Product";

        // Mark order as returned to stock - use "Order ID" column
        // Only set returned_to_stock flag, DO NOT change shipping_status
        console.log("[RETURN TO STOCK] STEP 1: Mark order as returned to stock", {
            orderId,
            column: '"Order ID"',
        });

        const { error: orderErr } = await supabase
            .from("orders")
            .update({
                returned_to_stock: true,
            })
            .eq('"Order ID"', orderId);

        if (orderErr) {
            console.error("[RETURN TO STOCK ERROR] Order update failed:", {
                message: orderErr.message,
                code: orderErr.code,
                details: orderErr.details,
                hint: orderErr.hint
            });
            throw orderErr;
        }

        console.log("[RETURN TO STOCK] ✓ Order updated successfully");

        // Log to stock_history
        console.log("[RETURN TO STOCK] STEP 2: Log to stock_history", {
            workspaceId,
            tracking
        });

        const { error: historyErr } = await supabase.from("stock_history").insert({
            workspace_id: workspaceId,
            product_id: items[0]?.product_id || null,
            quantity_change: totalQty,
            reason: "Return To Inventory",
            reference_id: tracking,
            movement_type: "RETURN_TO_STOCK",
        });

        if (historyErr) {
            console.error("[RETURN TO STOCK ERROR] stock_history insert failed:", {
                message: historyErr.message,
                code: historyErr.code,
                details: historyErr.details,
                hint: historyErr.hint
            });
            // Don't throw - history logging is secondary
        } else {
            console.log("[RETURN TO STOCK] ✓ Stock history logged");
        }

        // Broadcast for real-time refresh of other components
        console.log("[RETURN TO STOCK] STEP 3: Broadcast event", {
            orderId,
            totalQty
        });

        window.dispatchEvent(new CustomEvent("return-to-inventory-complete", {
            detail: { orderId, qty: totalQty }
        }));

        console.log("[RETURN TO STOCK] ✓ SUCCESS", {
            tracking,
            productName,
            totalQty
        });

        return {
            success: true,
            tracking,
            productName,
            qty: totalQty,
            newStock: undefined, // Don't show new stock since we're not modifying product.stock
        };
    } catch (err: any) {
        console.error("[RETURN TO STOCK ERROR] EXCEPTION:", err);
        return {
            success: false,
            error: err?.message || "Unable to return package to stock.",
            tracking,
            productName: items[0]?.name ?? "Product",
            qty: 0,
            newStock: undefined,
        };
    }
}
