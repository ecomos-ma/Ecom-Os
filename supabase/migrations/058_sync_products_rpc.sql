-- ==============================================================================
-- RPC for Bulk Syncing Products from Orders
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.sync_products_from_orders(p_workspace_id UUID)
RETURNS JSON AS $$
DECLARE
    v_order RECORD;
    v_clean_name TEXT;
    v_clean_sku TEXT;
    v_product_id UUID;
    v_selling_price NUMERIC;
    v_created INTEGER := 0;
    v_updated INTEGER := 0;
    v_merged INTEGER := 0;
    v_errors INTEGER := 0;
    v_start_time TIMESTAMP := clock_timestamp();
    v_execution_time TEXT;
BEGIN
    FOR v_order IN 
        SELECT * FROM public.orders 
        WHERE workspace_id = p_workspace_id 
        ORDER BY created_at ASC
    LOOP
        BEGIN
            v_clean_name := COALESCE(v_order.product_variant, v_order.sku, 'Unknown Product');
            v_clean_name := public.clean_product_name(v_clean_name);
            
            IF v_order.sku IS NULL OR v_order.sku = '' OR v_order.sku = 'N/A' THEN
                v_clean_sku := public.generate_sku_from_name(v_clean_name);
            ELSE
                v_clean_sku := v_order.sku;
            END IF;
            
            v_selling_price := COALESCE(v_order.variant_price, v_order.total, 0);

            IF v_clean_sku IS NOT NULL AND v_clean_sku != 'N/A' THEN
                -- Find product
                SELECT id INTO v_product_id FROM public.products 
                WHERE (sku = v_clean_sku OR lower(name) = lower(v_clean_name)) 
                  AND workspace_id = p_workspace_id 
                LIMIT 1;
                
                IF v_product_id IS NULL THEN
                    INSERT INTO public.products (
                        workspace_id, name, sku, price, cost, stock, initial_stock, status
                    ) VALUES (
                        p_workspace_id, v_clean_name, v_clean_sku, v_selling_price, 0, 0, 0, 'active'
                    ) RETURNING id INTO v_product_id;
                    v_created := v_created + 1;
                ELSE
                    -- Product exists, we check if price is higher, we update it maybe? 
                    -- Or we just consider it merged
                    v_merged := v_merged + 1;
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_errors := v_errors + 1;
        END;
    END LOOP;
    
    -- Now, we need to completely recount the stock based on ALL orders, so it's perfectly accurate
    -- Reset all counters to 0 for this workspace
    UPDATE public.products SET 
        reserved_stock = 0,
        delivered_stock = 0,
        returned_stock = 0,
        cancelled_stock = 0,
        out_for_delivery_stock = 0
    WHERE workspace_id = p_workspace_id;
    
    -- Recalculate based on ALL orders
    UPDATE public.products p
    SET 
        reserved_stock = sub.reserved,
        delivered_stock = sub.delivered,
        returned_stock = sub.returned,
        cancelled_stock = sub.cancelled,
        out_for_delivery_stock = sub.reserved -- Using reserved as proxy for out_for_delivery for simplicity since we combine them
    FROM (
        SELECT 
            coalesce(sku_raw, generated_sku) as sku,
            COUNT(CASE WHEN is_reserved THEN 1 END) as reserved,
            COUNT(CASE WHEN is_delivered THEN 1 END) as delivered,
            COUNT(CASE WHEN is_returned THEN 1 END) as returned,
            COUNT(CASE WHEN is_cancelled THEN 1 END) as cancelled
        FROM (
            SELECT 
                o.sku as sku_raw,
                public.generate_sku_from_name(public.clean_product_name(COALESCE(o.product_variant, o.sku, 'Unknown Product'))) as generated_sku,
                LOWER(o.status) IN ('confirmed', 'pending_confirmation', 'ready', 'preparing', 'packaging', 'waiting_pickup', 'picked_up', 'received_at_agency', 'distribution', 'out_for_delivery', 'pas_reponse', 'reporte', 'reconfirmed', 'customer_requested_delay', 'waiting_customer', 'shipped', 'mise en distribution') as is_reserved,
                LOWER(o.status) IN ('delivered', 'livre', 'تم التسليم') as is_delivered,
                LOWER(o.status) IN ('returned', 'retour', 'retour expediteur', 'returned to sender', 'rts', 'رجع') as is_returned,
                LOWER(o.status) IN ('cancelled', 'رفض', 'duplicate', 'fake', 'wrong_number', 'cancelled_before_shipping', 'customer_cancelled', 'delete_order', 'canceled') as is_cancelled
            FROM public.orders o
            WHERE o.workspace_id = p_workspace_id
        ) raw
        GROUP BY coalesce(sku_raw, generated_sku)
    ) sub
    WHERE p.sku = sub.sku AND p.workspace_id = p_workspace_id;
    
    v_updated := v_created + v_merged; -- products re-calculated
    v_execution_time := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start_time)) || 'ms';

    RETURN json_build_object(
        'created', v_created,
        'updated', (SELECT COUNT(*) FROM public.products WHERE workspace_id = p_workspace_id),
        'merged', v_merged,
        'errors', v_errors,
        'execution_time', v_execution_time
    );
END;
$$ LANGUAGE plpgsql;
