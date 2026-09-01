import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo, ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import type { Order } from "../lib/types";
import { getCached, setCached } from "../lib/queryCache";
import { getDemoDataStore, shouldUseDemoData } from "../demo";

interface OrdersContextValue {
    globalOrders: Order[];
    loading: boolean;
    reloadGlobalOrders: (forceReload?: boolean) => Promise<void>;
}

export const OrdersContext = createContext<OrdersContextValue>({
    globalOrders: [],
    loading: true,
    reloadGlobalOrders: async (_forceReload?: boolean) => { },
});

/** Debounce helper — returns a function that delays invocation */
function createDebounce(delay: number) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (fn: () => void) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fn, delay);
    };
}

// This survives a development StrictMode remount and coordinates any brief
// overlap between app-shell instances without widening the cache to another
// workspace.
const ordersLoadRequests = new Map<string, Promise<void>>();

export function OrdersProvider({ children }: { children: ReactNode }) {
    const { workspace } = useAuth();
    const [globalOrders, setGlobalOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const loadRef = useRef<((forceReload?: boolean) => Promise<void>) | null>(null);
    const hasLoadedRef = useRef(false);
    const activeWorkspaceRef = useRef<string | null>(null);

    const load = useCallback(async (forceReload = false) => {
        // Use demo data if in demo mode
        if (shouldUseDemoData()) {
            const demoStore = getDemoDataStore();
            const demoOrders = demoStore.getOrders();
            setGlobalOrders(demoOrders);
            setLoading(false);
            hasLoadedRef.current = true;
            return;
        }

        if (!workspace?.id) {
            activeWorkspaceRef.current = null;
            hasLoadedRef.current = false;
            setGlobalOrders([]);
            setLoading(false);
            return;
        }

        if (activeWorkspaceRef.current !== workspace.id) {
            activeWorkspaceRef.current = workspace.id;
            hasLoadedRef.current = false;
        }

        const requestedWorkspaceId = workspace.id;

        const cacheKey = `orders:${requestedWorkspaceId}:list`;
        const cachedOrders = getCached<Order[]>(cacheKey, true);
        if (!forceReload && cachedOrders) {
            if (activeWorkspaceRef.current !== requestedWorkspaceId) return;
            setGlobalOrders(cachedOrders);
            hasLoadedRef.current = true;
            setLoading(false);
            // A fresh cache avoids a request on every route switch. Stale data
            // stays visible while the refresh below happens in the background.
            if (getCached<Order[]>(cacheKey)) return;
        }

        // Skip loading if we already have data (state preservation) unless forceReload is true
        if (!forceReload && hasLoadedRef.current && !cachedOrders) {
            setLoading(false);
            return;
        }

        setLoading(!cachedOrders);

        const existingRequest = ordersLoadRequests.get(cacheKey);
        if (existingRequest) {
            try {
                await existingRequest;
                const sharedOrders = getCached<Order[]>(cacheKey, true);
                if (sharedOrders) {
                    if (activeWorkspaceRef.current !== requestedWorkspaceId) return;
                    setGlobalOrders(sharedOrders);
                    hasLoadedRef.current = true;
                }
            } finally {
                if (activeWorkspaceRef.current === requestedWorkspaceId) setLoading(false);
            }
            return;
        }

        let resolveRequest!: () => void;
        const request = new Promise<void>((resolve) => { resolveRequest = resolve; });
        ordersLoadRequests.set(cacheKey, request);

        try {
            let { data, error } = await supabase
                .from("orders")
                .select(`
        "Order ID",
        order_number,
        customer_id,
        customer_name,
        city,
        city_name,
        address,
        total,
        status,
        delivery_status,
        shipping_status,
        shipping_provider,
        tracking_number,
        shipment_id,
        shipment_status,
        shipping_status_raw,
        shipping_updated_at,
        last_tracking_sync,
        last_shipping_sync_at,
        shipping_company,
        shipping_cost,
        parcel_created_at,
        delivery_note_ref,
        ozon_raw_response,
        coliaty_parcel_code,
        phone,
        sku,
        product_variant,
        campaign_id,
        created_at,
        ozon_city_id,
        coliaty_city_id,
        source,
        confirmation_method,
        whatsapp_handoff_active,
        whatsapp_handoff_reason,
        whatsapp_handoff_at,
        customers(id, name, phone, city),
        ozon_cities(id, name, delivered_price, returned_price, refused_price)
      `)
                .eq("workspace_id", requestedWorkspaceId)
                .order("created_at", { ascending: false })
                .limit(500);

            if (error) {
                // Fallback: flat query without joins
                const fbRes = await supabase
                    .from("orders")
                    .select('"Order ID", order_number, customer_id, customer_name, city, city_name, address, total, status, delivery_status, shipping_status, shipping_provider, tracking_number, shipment_id, shipment_status, shipping_status_raw, shipping_updated_at, last_tracking_sync, last_shipping_sync_at, shipping_company, shipping_cost, parcel_created_at, delivery_note_ref, ozon_raw_response, coliaty_parcel_code, phone, sku, product_variant, campaign_id, created_at, ozon_city_id, coliaty_city_id, source, confirmation_method, whatsapp_handoff_active, whatsapp_handoff_reason, whatsapp_handoff_at')
                    .eq("workspace_id", requestedWorkspaceId)
                    .order("created_at", { ascending: false })
                    .limit(500);

                if (!fbRes.error && fbRes.data) {
                    const fallbackData = fbRes.data as any[];
                    const customerIds = fallbackData.map((o) => o.customer_id).filter(Boolean);
                    const phones = fallbackData.map((o) => o.phone).filter(Boolean);

                    let customersMap = new Map();
                    if (customerIds.length > 0 || phones.length > 0) {
                        let custQuery = supabase
                            .from("customers")
                            .select("id, name, phone, city")
                            .eq("workspace_id", requestedWorkspaceId);
                        if (customerIds.length > 0 && phones.length > 0) {
                            custQuery = custQuery.or(
                                `id.in.(${customerIds.map((id) => `"${id}"`).join(",")}), phone.in.(${phones.map((p) => `"${p}"`).join(",")})`
                            );
                        } else if (customerIds.length > 0) {
                            custQuery = custQuery.in("id", customerIds);
                        } else {
                            custQuery = custQuery.in("phone", phones);
                        }

                        const { data: custData } = await custQuery;
                        if (custData) {
                            custData.forEach((c: any) => {
                                customersMap.set(c.id, c);
                                if (c.phone) customersMap.set(c.phone, c);
                            });
                        }
                    }

                    data = fallbackData.map((o) => ({
                        ...o,
                        customer: (o.customer_id ? customersMap.get(o.customer_id) : undefined)
                            || (o.phone ? customersMap.get(o.phone) : undefined)
                            || (o.customer_name || o.phone
                                ? {
                                    id: o.customer_id || `order:${o["Order ID"]}`,
                                    workspace_id: requestedWorkspaceId,
                                    name: o.customer_name || "Unknown customer",
                                    phone: o.phone || null,
                                    city: o.city_name || o.city || null,
                                    created_at: o.created_at,
                                }
                                : null),
                    }));
                    error = null;
                } else {
                    console.error("[OrdersContext] Fallback query also failed:", fbRes.error);
                    error = fbRes.error;
                }
            } else if (data) {
                data = (data as any[]).map((o) => {
                    const rawCust = o.customers;
                    const customer = Array.isArray(rawCust) ? rawCust[0] : rawCust;
                    const rawCity = o.ozon_cities;
                    const ozonCity = Array.isArray(rawCity) ? rawCity[0] : rawCity;
                    return {
                        ...o,
                        customer: customer || (o.customer_name || o.phone
                            ? {
                                id: o.customer_id || `order:${o["Order ID"]}`,
                                workspace_id: requestedWorkspaceId,
                                name: o.customer_name || "Unknown customer",
                                phone: o.phone || null,
                                city: o.city_name || o.city || null,
                                created_at: o.created_at,
                            }
                            : null),
                        ozon_city: ozonCity || null,
                    };
                });
            }

            if (!error && data) {
                const campaignIds = data.map((o) => o.campaign_id).filter(Boolean);
                const orderIds = (data as any[]).map((o) => o["Order ID"] || o.id).filter(Boolean);

                // ── PARALLEL: fetch campaigns + shipments simultaneously ──
                const [campaignsResult, shipmentsResult] = await Promise.all([
                    campaignIds.length > 0
                        ? supabase
                            .from("meta_campaigns")
                            .select("id, campaign_name")
                            .eq("workspace_id", requestedWorkspaceId)
                            .in("id", campaignIds)
                        : { data: [], error: null },
                    orderIds.length > 0
                        ? supabase
                            .from("shipments")
                            .select("order_id, tracking_number, delivery_status, pickup_status, provider")
                            .in("order_id", orderIds)
                        : { data: [], error: null },
                ]);

                const campaignsMap = new Map();
                if (campaignsResult.data) {
                    campaignsResult.data.forEach((c: any) => {
                        campaignsMap.set(c.id, c);
                    });
                }

                const shipmentsMap = new Map<string, any>();
                if (!shipmentsResult.error && shipmentsResult.data) {
                    shipmentsResult.data.forEach((shipment: any) => {
                        if (shipment?.order_id) {
                            shipmentsMap.set(shipment.order_id, shipment);
                        }
                    });
                }

                data = data.map((o: any) => {
                    const resolvedId = o["Order ID"] || o.id;
                    const shipment = shipmentsMap.get(resolvedId) || shipmentsMap.get(o.id);

                    let shippingCost = o.shipping_cost ?? null;
                    if (shippingCost === null && o.ozon_city) {
                        const status = (o.delivery_status || o.status || "").toLowerCase();
                        if (status.includes('delivered') || status.includes('livre') || status.includes('livré')) {
                            shippingCost = o.ozon_city.delivered_price;
                        } else if (status.includes('returned') || status.includes('retour') || status.includes('retours')) {
                            shippingCost = o.ozon_city.returned_price;
                        } else if (status.includes('refused') || status.includes('refus')) {
                            shippingCost = o.ozon_city.refused_price;
                        } else {
                            shippingCost = o.ozon_city.delivered_price;
                        }
                    }

                    return {
                        ...o,
                        id: resolvedId,
                        city: o.city || null,
                        address: o.address || null,
                        campaign:
                            o.campaign_id && campaignsMap.has(o.campaign_id)
                                ? { name: campaignsMap.get(o.campaign_id)?.campaign_name }
                                : null,
                        tracking_number: o.tracking_number ?? shipment?.tracking_number ?? null,
                        shipment_id: o.shipment_id ?? shipment?.id ?? null,
                        shipment_status: o.shipment_status ?? shipment?.pickup_status ?? null,
                        shipping_status: o.shipping_status ?? null,
                        shipping_status_raw: o.shipping_status_raw ?? null,
                        shipping_provider: o.shipping_provider ?? shipment?.provider ?? null,
                        delivery_status: o.delivery_status ?? shipment?.delivery_status ?? null,
                        delivery_note_ref: o.delivery_note_ref ?? null,
                        shipping_cost: shippingCost ?? null,
                        last_tracking_sync: o.last_tracking_sync ?? null,
                        last_shipping_sync_at: o.last_shipping_sync_at ?? null,
                        shipping_updated_at: o.shipping_updated_at ?? null,
                        ozon_raw_response: o.ozon_raw_response ?? null,
                        coliaty_parcel_code: o.coliaty_parcel_code ?? null,
                        shipping_company: o.shipping_company ?? null,
                        parcel_created_at: o.parcel_created_at ?? null,
                    };
                });

                const sorted = (data as unknown as Order[]).sort((a, b) => {
                    const dateA = new Date(a.created_at).getTime();
                    const dateB = new Date(b.created_at).getTime();
                    if (dateA !== dateB) {
                        return dateB - dateA;
                    }
                    const numA = parseInt(a.order_number.split("-").pop() ?? "", 10);
                    const numB = parseInt(b.order_number.split("-").pop() ?? "", 10);
                    if (!isNaN(numA) && !isNaN(numB)) {
                        return numB - numA;
                    }
                    return b.order_number.localeCompare(a.order_number);
                });
                setCached(cacheKey, sorted, 120_000);
                if (activeWorkspaceRef.current === requestedWorkspaceId) {
                    setGlobalOrders(sorted);
                    hasLoadedRef.current = true;
                }
            } else {
                if (error) console.error("[OrdersContext] Failed to load orders:", error);
                if (activeWorkspaceRef.current === requestedWorkspaceId) setGlobalOrders([]);
            }
        } finally {
            resolveRequest();
            if (ordersLoadRequests.get(cacheKey) === request) ordersLoadRequests.delete(cacheKey);
            if (activeWorkspaceRef.current === requestedWorkspaceId) setLoading(false);
        }
    }, [workspace?.id]);

    useEffect(() => {
        loadRef.current = load;
    }, [load]);

    useEffect(() => {
        if (!workspace?.id) {
            activeWorkspaceRef.current = null;
            hasLoadedRef.current = false;
            setGlobalOrders([]);
            setLoading(false);
            return;
        }

        activeWorkspaceRef.current = workspace.id;
        hasLoadedRef.current = false;
        setGlobalOrders([]);
        setLoading(true);

        loadRef.current?.();

        // Debounced RT reload — batch rapid events (100ms for faster refresh)
        const debouncedReload = createDebounce(100);

        // Supabase RT Subscription for Orders — stable channel name
        const channel = supabase.channel(`orders-ctx-${workspace.id}`);
        channel.on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "orders",
                filter: `workspace_id=eq.${workspace.id}`,
            },
            (payload) => {
                if (payload.eventType === "UPDATE") {
                    // Update only the changed row locally without triggering a database refetch
                    setGlobalOrders?.((prev: Order[]) =>
                        prev.map(o => (o.id === (payload.new as any).id || (o as any)["Order ID"] === (payload.new as any)["Order ID"])
                            ? { ...o, ...(payload.new as any) }
                            : o
                        )
                    );

                    // Also update cache directly
                    const cacheKey = `orders:${workspace.id}:list`;
                    try {
                        const cached = JSON.parse(localStorage.getItem(cacheKey) || "{}");
                        if (cached && cached.data && Array.isArray(cached.data)) {
                            cached.data = cached.data.map((o: any) =>
                                (o.id === (payload.new as any).id || o["Order ID"] === (payload.new as any)["Order ID"]) ? { ...o, ...(payload.new as any) } : o
                            );
                            localStorage.setItem(cacheKey, JSON.stringify(cached));
                        }
                    } catch (e) { }
                } else {
                    // For INSERT or DELETE, we fetch to assure correct pagination and relationships
                    const cacheKey = `orders:${workspace.id}:list`;
                    setCached(cacheKey, null);
                    debouncedReload(() => loadRef.current?.(true));
                }

            }
        );
        void channel.subscribe();

        const handleNewOrders = () => debouncedReload(() => loadRef.current?.(true));
        window.addEventListener("trigger-order-reload", handleNewOrders);

        return () => {
            void channel.unsubscribe();
            supabase.removeChannel(channel);
            window.removeEventListener("trigger-order-reload", handleNewOrders);
        };
    }, [workspace?.id]);

    // ── Stable context value — only changes when orders/loading actually change ──
    const contextValue = useMemo<OrdersContextValue>(
        () => ({ globalOrders, loading, reloadGlobalOrders: load }),
        [globalOrders, loading, load]
    );

    return (
        <OrdersContext.Provider value={contextValue}>
            {children}
        </OrdersContext.Provider>
    );
}

export function useGlobalOrders() {
    return useContext(OrdersContext);
}
