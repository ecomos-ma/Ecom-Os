// ============================================================
// FOUNDER INTERNAL ACCESS EDGE FUNCTION
// ============================================================
// Server-side access verification for hidden founder page
// Only accessible to ziadennachat5@gmail.com

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOUNDER_EMAIL = "ziadennachat5@gmail.com";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role to verify user and access data
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Extract user from JWT for authentication
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify email matches founder email
    if (authUser.email?.toLowerCase() !== FOUNDER_EMAIL.toLowerCase()) {
      console.warn(`[Founder Internal] Unauthorized access attempt by: ${authUser.email}`);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle different operations
    const url = new URL(req.url);
    const operation = url.searchParams.get("operation") || "status";

    switch (operation) {
      case "status":
        return new Response(
          JSON.stringify({
            authorized: true,
            email: authUser.email,
            user_id: authUser.id,
            timestamp: new Date().toISOString()
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case "workspace-overview":
        // Fetch workspace overview directly using service role to bypass RLS
        const { data: workspaces, error: workspacesError } = await supabase
          .from('workspaces')
          .select('id, name, created_at')
          .order('created_at', { ascending: false });

        if (workspacesError) {
          console.error("[Founder Internal] Workspaces error:", workspacesError);
          return new Response(
            JSON.stringify({ error: workspacesError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // For each workspace, get order counts and revenue
        const workspaceData = await Promise.all(
          (workspaces || []).map(async (workspace) => {
            const { data: orders, error: ordersError } = await supabase
              .from('orders')
              .select('total, status, shipping_status, delivery_status, created_at')
              .eq('workspace_id', workspace.id);

            if (ordersError) {
              console.error(`[Founder Internal] Orders error for workspace ${workspace.id}:`, ordersError);
              return {
                workspace_id: workspace.id,
                workspace_name: workspace.name,
                created_at: workspace.created_at,
                total_orders: 0,
                total_revenue: 0,
                active_integrations: {},
                last_activity: workspace.created_at
              };
            }

            const totalOrders = orders?.length || 0;
            const totalRevenue = orders?.reduce((sum, order) => {
              const isDelivered = 
                order.shipping_status === 'delivered' || 
                order.delivery_status === 'delivered' || 
                order.status === 'delivered';
              return sum + (isDelivered ? (order.total || 0) : 0);
            }, 0) || 0;

            const lastActivity = orders?.length > 0 
              ? orders.reduce((latest, order) => 
                  new Date(order.created_at) > new Date(latest) ? order.created_at : latest, 
                  orders[0].created_at)
              : workspace.created_at;

            // Check integrations
            const integrations: Record<string, boolean> = {};
            const integrationTables = [
              'ozon_credentials',
              'ameex_credentials', 
              'sendit_credentials',
              'youcan_credentials',
              'whatsapp_credentials',
              'shopify_credentials'
            ];

            for (const table of integrationTables) {
              const { data: creds } = await supabase
                .from(table)
                .select('id')
                .eq('workspace_id', workspace.id)
                .limit(1);
              integrations[table.replace('_credentials', '')] = (creds?.length || 0) > 0;
            }

            return {
              workspace_id: workspace.id,
              workspace_name: workspace.name,
              created_at: workspace.created_at,
              total_orders: totalOrders,
              total_revenue: totalRevenue,
              active_integrations: integrations,
              last_activity: lastActivity
            };
          })
        );

        return new Response(
          JSON.stringify(workspaceData),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case "execute":
        // Execute founder-specific operation
        const body = await req.json();
        const { data: operationResult, error: operationError } = await supabase
          .rpc("founder_internal_operation", {
            operation_key: body.key || "unknown",
            operation_data: body.data || {}
          });

        if (operationError) {
          return new Response(
            JSON.stringify({ error: operationError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify(operationResult),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      default:
        return new Response(
          JSON.stringify({ error: "Unknown operation" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

  } catch (error) {
    console.error("[Founder Internal] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
