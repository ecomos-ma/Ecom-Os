/**
 * paypal-subscription – Supabase Edge Function
 *
 * Routes:
 *   POST …/create   – Create (or reuse) PayPal Product + Billing Plan, then
 *                     create a Subscription and return its ID to the frontend.
 *   POST …/verify   – Server-side verification after PayPal approval; activates
 *                     the Ecom OS subscription without trusting the frontend.
 *   POST …/webhook  – Receives PayPal webhook events with signature verification,
 *                     event-ID idempotency, and transaction-ID deduplication.
 *   POST …/cancel   – Seller-initiated cancellation: calls PayPal API, preserves
 *                     access until billing period ends.
 *
 * Secrets (set in Supabase Dashboard → Edge Functions → Secrets):
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_CLIENT_SECRET
 *   PAYPAL_ENV          sandbox | live   (default: sandbox)
 *   PAYPAL_WEBHOOK_ID   from PayPal Developer Dashboard after webhook registration
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ─── Environment ──────────────────────────────────────────────────────────────
const PAYPAL_ENV = Deno.env.get("PAYPAL_ENV") || "sandbox";
const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID") || "";
const PAYPAL_CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET") || "";
const PAYPAL_WEBHOOK_ID = Deno.env.get("PAYPAL_WEBHOOK_ID") || "";

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    console.warn("[paypal-subscription] PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not configured.");
}

const PAYPAL_API_BASE = PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

// Service-role Supabase client (no user context — used for privileged DB ops)
const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ─── PayPal helpers ───────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
    const creds = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
    const r = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
    });
    if (!r.ok) throw new Error(`PayPal auth failed (${r.status})`);
    return (await r.json()).access_token;
}

async function ppGet(path: string, token: string) {
    const r = await fetch(`${PAYPAL_API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return { ok: r.ok, status: r.status, data: await r.json() };
}

async function ppPost(path: string, body: unknown, token: string) {
    const r = await fetch(`${PAYPAL_API_BASE}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const text = await r.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: r.ok, status: r.status, data };
}

// ─── FX rate (reads from paypal_billing_config, falls back to 0.10) ─────────
// Update via: UPDATE public.paypal_billing_config SET value = '0.11' WHERE key = 'mad_to_usd_rate';
async function getMadToUsdRate(): Promise<number> {
    const { data } = await supabaseAdmin
        .from("paypal_billing_config")
        .select("value")
        .eq("key", "mad_to_usd_rate")
        .maybeSingle();
    const rate = parseFloat(String(data?.value ?? "0.10"));
    return isNaN(rate) || rate <= 0 ? 0.10 : rate;
}

// ─── Auth helper ──────────────────────────────────────────────────────────────
async function resolveUser(req: Request) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return null;
    const { data: { user } } = await supabaseAdmin.auth.getUser(
        authHeader.replace("Bearer ", ""),
    );
    return user ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /create
// Creates (or reuses) PayPal Product → Billing Plan → Subscription.
// Prices come exclusively from the DB. Exchange rate from DB setting.
// ─────────────────────────────────────────────────────────────────────────────
async function handleCreate(req: Request): Promise<Response> {
    const user = await resolveUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { planCode, billingCycle } = body as { planCode?: string; billingCycle?: string };
    if (!planCode || !billingCycle) return json({ error: "Missing planCode or billingCycle" }, 400);
    if (!["monthly", "annual"].includes(billingCycle)) return json({ error: "Invalid billingCycle" }, 400);

    // Fetch Ecom OS plan from DB (price is authoritative here)
    const { data: plan, error: planErr } = await supabaseAdmin
        .from("subscription_plans")
        .select("id, code, name, description, monthly_price_mad, annual_price_mad, paypal_product_id, paypal_monthly_plan_id, paypal_annual_plan_id, paypal_currency, paypal_conversion_rate")
        .eq("code", planCode)
        .eq("is_active", true)
        .maybeSingle();

    if (planErr || !plan) return json({ error: "Plan not found or inactive" }, 400);

    const isAnnual = billingCycle === "annual";
    const priceMad = isAnnual ? plan.annual_price_mad : plan.monthly_price_mad;
    if (!priceMad || priceMad <= 0) return json({ error: "Plan price not configured" }, 400);

    // FX rate from DB setting — never from frontend
    const rate = await getMadToUsdRate();
    const priceUsd = parseFloat((priceMad * rate).toFixed(2));
    const currency = "USD"; // PayPal Subscriptions require a supported currency

    try {
        const token = await getAccessToken();

        // ── 1. Product (reuse if exists) ──────────────────────────────────────────
        let productId = plan.paypal_product_id;
        if (!productId) {
            const pr = await ppPost("/v1/catalogs/products", {
                name: `Ecom OS – ${plan.name}`,
                description: plan.description || `Ecom OS ${plan.name} subscription`,
                type: "SERVICE",
                category: "SOFTWARE",
            }, token);
            if (!pr.ok) throw new Error(`Product creation failed: ${JSON.stringify(pr.data)}`);
            productId = (pr.data as { id: string }).id;

            // Persist immediately so next checkout reuses it
            await supabaseAdmin
                .from("subscription_plans")
                .update({ paypal_product_id: productId })
                .eq("id", plan.id);
        }

        // ── 2. Billing Plan (reuse if exists; create only for genuinely new config) ─
        const existingPlanId = isAnnual ? plan.paypal_annual_plan_id : plan.paypal_monthly_plan_id;
        let paypalPlanId = existingPlanId;

        if (!paypalPlanId) {
            const planResp = await ppPost("/v1/billing/plans", {
                product_id: productId,
                name: `Ecom OS – ${plan.name} (${isAnnual ? "Annual" : "Monthly"})`,
                description: `${plan.name} – ${isAnnual ? "Yearly" : "Monthly"} billing. Price: ${priceUsd} USD (${priceMad} MAD @ rate:${rate})`,
                status: "ACTIVE",
                billing_cycles: [{
                    frequency: { interval_unit: isAnnual ? "YEAR" : "MONTH", interval_count: 1 },
                    tenure_type: "REGULAR",
                    sequence: 1,
                    total_cycles: 0, // infinite
                    pricing_scheme: { fixed_price: { value: String(priceUsd), currency_code: currency } },
                }],
                payment_preferences: {
                    auto_bill_outstanding: true,
                    setup_fee_failure_action: "CONTINUE",
                    payment_failure_threshold: 3,
                },
            }, token);

            if (!planResp.ok) throw new Error(`Billing Plan creation failed: ${JSON.stringify(planResp.data)}`);
            paypalPlanId = (planResp.data as { id: string }).id;

            const updateCol = isAnnual
                ? { paypal_annual_plan_id: paypalPlanId, paypal_currency: currency, paypal_conversion_rate: rate }
                : { paypal_monthly_plan_id: paypalPlanId, paypal_currency: currency, paypal_conversion_rate: rate };

            await supabaseAdmin.from("subscription_plans").update(updateCol).eq("id", plan.id);
        }

        // ── 3. Create Subscription (each checkout generates a fresh one) ──────────
        const subResp = await ppPost("/v1/billing/subscriptions", {
            plan_id: paypalPlanId,
            custom_id: `${user.id}|${planCode}|${billingCycle}`, // internal linkage
            application_context: {
                brand_name: "Ecom OS",
                user_action: "SUBSCRIBE_NOW",
                return_url: "https://placeholder.com/paypal-return",
                cancel_url: "https://placeholder.com/paypal-cancel",
            },
        }, token);

        if (!subResp.ok) throw new Error(`Subscription creation failed: ${JSON.stringify(subResp.data)}`);

        return json({
            success: true,
            subscriptionID: (subResp.data as { id: string }).id,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[create] Error:", msg);
        return json({ error: "Server error during PayPal setup" }, 500);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /verify
// Server-side verification after PayPal onApprove callback.
// Validates the subscription against our DB plan; never trusts frontend alone.
// ─────────────────────────────────────────────────────────────────────────────
async function handleVerify(req: Request): Promise<Response> {
    const user = await resolveUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { subscriptionID, expectedPlanCode, billingCycle } =
        body as { subscriptionID?: string; expectedPlanCode?: string; billingCycle?: string };

    if (!subscriptionID || !expectedPlanCode || !billingCycle)
        return json({ error: "Missing required fields" }, 400);

    // ── Guard: already activated? ────────────────────────────────────────────
    const { data: already } = await supabaseAdmin
        .from("user_subscriptions")
        .select("id, owner_user_id")
        .eq("paypal_subscription_id", subscriptionID)
        .maybeSingle();
    if (already) {
        if (already.owner_user_id !== user.id) return json({ error: "Workspace ownership mismatch" }, 403);
        return json({ success: true, idempotent: true, subscription_id: already.id });
    }

    // ── Guard: transaction already recorded? ─────────────────────────────────
    const { data: txExists } = await supabaseAdmin
        .from("subscription_payment_requests")
        .select("id")
        .eq("paypal_subscription_id", subscriptionID)
        .maybeSingle();
    if (txExists) return json({ error: "Duplicate verification" }, 409);

    // ── Fetch Ecom OS plan ────────────────────────────────────────────────────
    const { data: plan } = await supabaseAdmin
        .from("subscription_plans")
        .select("id, monthly_price_mad, annual_price_mad, paypal_monthly_plan_id, paypal_annual_plan_id, paypal_currency, paypal_conversion_rate")
        .eq("code", expectedPlanCode)
        .eq("is_active", true)
        .maybeSingle();
    if (!plan) return json({ error: "Plan not found" }, 400);

    const isAnnual = billingCycle === "annual";
    const expectedPaypalPlanId = isAnnual ? plan.paypal_annual_plan_id : plan.paypal_monthly_plan_id;
    const priceMad = isAnnual ? plan.annual_price_mad : plan.monthly_price_mad;

    try {
        const token = await getAccessToken();

        // ── Fetch PayPal subscription ─────────────────────────────────────────
        const subResp = await ppGet(`/v1/billing/subscriptions/${subscriptionID}`, token);
        if (!subResp.ok) return json({ error: "PayPal subscription not found" }, 400);
        const sub = subResp.data as {
            id: string;
            plan_id: string;
            status: string;
            custom_id: string;
            start_time: string;
            billing_info: { next_billing_time?: string; last_payment?: { time: string; amount: { value: string; currency_code: string } } };
        };

        // ── Status check ──────────────────────────────────────────────────────
        if (!["ACTIVE", "APPROVED"].includes(sub.status))
            return json({ error: `Invalid subscription status: ${sub.status}` }, 400);

        // ── Plan ID must match our DB mapping ─────────────────────────────────
        if (sub.plan_id !== expectedPaypalPlanId)
            return json({ error: "PayPal plan ID mismatch — possible tampering" }, 400);

        // ── custom_id must encode this user ───────────────────────────────────
        const customParts = (sub.custom_id || "").split("|");
        if (customParts[0] !== user.id)
            return json({ error: "Workspace ownership mismatch" }, 403);

        // ── Amount / currency verification ────────────────────────────────────
        const rate = plan.paypal_conversion_rate ?? await getMadToUsdRate();
        const expectedUsd = parseFloat((priceMad * rate).toFixed(2));
        const currency = plan.paypal_currency ?? "USD";

        const lastPay = sub.billing_info?.last_payment;
        const paypalAmount = lastPay ? parseFloat(lastPay.amount.value) : expectedUsd;
        const paypalCurrency = lastPay ? lastPay.amount.currency_code : currency;

        // Allow ±2 cent tolerance (floating point rounding)
        if (Math.abs(paypalAmount - expectedUsd) > 0.02)
            return json({ error: `Amount mismatch: expected ${expectedUsd}, got ${paypalAmount}` }, 400);

        // ── Dates ─────────────────────────────────────────────────────────────
        const startsAt = sub.start_time || new Date().toISOString();
        const nextBilling = sub.billing_info?.next_billing_time;
        const expiresAt = nextBilling
            ? new Date(nextBilling).toISOString()
            : (() => {
                const d = new Date(startsAt);
                d.setMonth(d.getMonth() + (isAnnual ? 12 : 1));
                return d.toISOString();
            })();
            // The subscription resource does not expose the sale transaction ID.
            // Leave payment history to PAYMENT.SALE.COMPLETED rather than using a
            // timestamp or subscription ID as a fake transaction reference.
            const txId = null;

        // ── Activate via service-role RPC (existing subscription, no new row) ─
        const { data: act, error: actErr } = await supabaseAdmin.rpc(
            "activate_paypal_subscription_v1",
            {
                p_paypal_subscription_id: subscriptionID,
                p_paypal_transaction_id: txId,
                p_user_id: user.id,
                p_plan_id: plan.id,
                p_billing_cycle: billingCycle,
                p_original_amount_mad: priceMad,
                p_paypal_amount: paypalAmount,
                p_paypal_currency: paypalCurrency,
                p_conversion_rate: rate,
                p_starts_at: startsAt,
                p_expires_at: expiresAt,
                p_payment_status: "paid",
            },
        );

        if (actErr) {
            console.error("[verify] Activation RPC error:", actErr.message);
            return json({ error: "Activation failed" }, 500);
        }
        if ((act as { success?: boolean })?.success === false) {
            return json({ error: (act as { reason?: string }).reason ?? "Already activated" }, 409);
        }

        return json({ success: true, data: act });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[verify] Error:", msg);
        return json({ error: "Verification failed" }, 500);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /webhook
// Receives all PayPal lifecycle events. Must be registered in PayPal Developer
// Dashboard → Webhooks. Verifies signature before processing.
// ─────────────────────────────────────────────────────────────────────────────
async function handleWebhook(req: Request): Promise<Response> {
    const payload = await req.text();

    // ── Signature verification ───────────────────────────────────────────────
    if (!PAYPAL_WEBHOOK_ID) {
        console.warn("[webhook] PAYPAL_WEBHOOK_ID not set — rejecting all events for safety");
        return new Response("Webhook not configured", { status: 503 });
    }

    const transmissionId = req.headers.get("paypal-transmission-id") || "";
    const transmissionTime = req.headers.get("paypal-transmission-time") || "";
    const certUrl = req.headers.get("paypal-cert-url") || "";
    const authAlgo = req.headers.get("paypal-auth-algo") || "";
    const transmissionSig = req.headers.get("paypal-transmission-sig") || "";

    let event: Record<string, unknown>;
    try { event = JSON.parse(payload); }
    catch { return new Response("Bad JSON", { status: 400 }); }

    const token = await getAccessToken();

    // Call PayPal's verification endpoint
    const verifyResp = await ppPost("/v1/notifications/verify-webhook-signature", {
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: PAYPAL_WEBHOOK_ID,
        webhook_event: event,
    }, token);

    if (!verifyResp.ok || (verifyResp.data as { verification_status?: string }).verification_status !== "SUCCESS") {
        console.error("[webhook] Signature verification failed");
        return new Response("Signature verification failed", { status: 400 });
    }

    const eventId = String(event.id ?? "");
    const eventType = String(event.event_type ?? "");

    // ── Event idempotency ────────────────────────────────────────────────────
    // Compute a digest (no raw payload stored — privacy/security)
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(payload));
    const digest = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

    const { data: isNew } = await supabaseAdmin.rpc("record_paypal_webhook_event_v1", {
        p_event_id: eventId,
        p_event_type: eventType,
        p_payload_digest: digest,
        p_result: "processing",
    });

    if (isNew === false) {
        // Already processed
        return json({ success: true, idempotent: true });
    }

    const resource = (event.resource ?? {}) as Record<string, unknown>;

    try {
        // BILLING.SUBSCRIPTION.CREATED
        // Informational: subscription created but not yet paid/approved.
        // Activation is handled server-side via /verify after user approval.
        if (eventType === "BILLING.SUBSCRIPTION.CREATED") {
            console.log("[webhook] BILLING.SUBSCRIPTION.CREATED -- no action needed (handled by /verify)");

            // BILLING.SUBSCRIPTION.ACTIVATED
            // Fires after first payment collected. Safety net only -- /verify already activated.
        } else if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") {
            console.log("[webhook] BILLING.SUBSCRIPTION.ACTIVATED -- already handled via /verify");

            // BILLING.SUBSCRIPTION.UPDATED
            // Plan/quantity changed in PayPal. Not applicable to our fixed-plan model.
        } else if (eventType === "BILLING.SUBSCRIPTION.UPDATED") {
            console.log("[webhook] BILLING.SUBSCRIPTION.UPDATED -- logged only, no action");

            // PAYMENT.SALE.COMPLETED
            // This is the ONLY official PayPal event for successful recurring payments.
            // BILLING.SUBSCRIPTION.RENEWED is NOT a real PayPal webhook event -- never use it.
            // resource.billing_agreement_id is the PayPal subscription ID for sale resources.
        } else if (eventType === "PAYMENT.SALE.COMPLETED") {
            const subscriptionId = String(resource.billing_agreement_id ?? "");
            if (!subscriptionId) {
                console.warn("[webhook] PAYMENT.SALE.COMPLETED missing billing_agreement_id -- skipping");
            } else {
                const txId = String(resource.id ?? "");
                if (!txId) throw new Error("PayPal sale event is missing its transaction ID");
                // resource.amount for PAYMENT.SALE.COMPLETED uses { total, currency }
                const amount = parseFloat(String((resource.amount as { total?: string })?.total ?? "0"));
                const currency = String((resource.amount as { currency?: string })?.currency ?? "USD");

                // Lookup conversion rate recorded at subscription activation
                const { data: sub } = await supabaseAdmin
                    .from("user_subscriptions")
                    .select("id, owner_user_id, plan_id, billing_cycle")
                    .eq("paypal_subscription_id", subscriptionId)
                    .maybeSingle();
                const paypalSubResp = sub ? null : await ppGet(`/v1/billing/subscriptions/${subscriptionId}`, token);
                const paypalSub = paypalSubResp?.ok ? paypalSubResp.data as { custom_id?: string; plan_id?: string; start_time?: string; billing_info?: { next_billing_time?: string } } : null;
                const customParts = String(paypalSub?.custom_id || "").split("|");
                const webhookUserId = customParts[0] || "";
                const webhookPlanCode = customParts[1] || "";
                const webhookCycle = customParts[2] === "annual" ? "annual" : "monthly";

                if (!sub && webhookUserId && webhookPlanCode) {
                    const { data: webhookPlan } = await supabaseAdmin
                        .from("subscription_plans")
                        .select("id, monthly_price_mad, annual_price_mad, paypal_monthly_plan_id, paypal_annual_plan_id, paypal_currency, paypal_conversion_rate")
                        .eq("code", webhookPlanCode)
                        .eq("is_active", true)
                        .maybeSingle();
                    const { data: ownerSubscription } = await supabaseAdmin
                        .from("user_subscriptions")
                        .select("id")
                        .eq("owner_user_id", webhookUserId)
                        .maybeSingle();
                    if (!webhookPlan || !ownerSubscription) throw new Error("Cannot resolve PayPal sale owner or plan");
                    const webhookPriceMad = webhookCycle === "annual" ? webhookPlan.annual_price_mad : webhookPlan.monthly_price_mad;
                    const webhookRate = webhookPlan.paypal_conversion_rate ?? await getMadToUsdRate();
                    const webhookStartsAt = paypalSub?.start_time || new Date().toISOString();
                    const webhookExpiresAt = paypalSub?.billing_info?.next_billing_time || (() => {
                        const date = new Date(webhookStartsAt);
                        date.setMonth(date.getMonth() + (webhookCycle === "annual" ? 12 : 1));
                        return date.toISOString();
                    })();
                    const { error: activationError } = await supabaseAdmin.rpc("activate_paypal_subscription_v1", {
                        p_paypal_subscription_id: subscriptionId,
                        p_paypal_transaction_id: txId,
                        p_user_id: webhookUserId,
                        p_plan_id: webhookPlan.id,
                        p_billing_cycle: webhookCycle,
                        p_original_amount_mad: webhookPriceMad,
                        p_paypal_amount: amount,
                        p_paypal_currency: currency,
                        p_conversion_rate: webhookRate,
                        p_starts_at: webhookStartsAt,
                        p_expires_at: webhookExpiresAt,
                        p_payment_status: "paid",
                    });
                    if (activationError) throw activationError;
                } else if (sub) {
                let conversionRate: number | null = null;
                if (sub?.plan_id) {
                    const { data: planRow } = await supabaseAdmin
                        .from("subscription_plans")
                        .select("paypal_conversion_rate")
                        .eq("id", sub.plan_id)
                        .maybeSingle();
                    conversionRate = planRow?.paypal_conversion_rate ?? null;
                }

                // Fetch next_billing_time from PayPal to set the new period end authoritatively
                const subData = await ppGet(`/v1/billing/subscriptions/${subscriptionId}`, token);
                const nextBilling = subData.ok
                    ? (subData.data as { billing_info?: { next_billing_time?: string } }).billing_info?.next_billing_time
                    : null;
                const fallback = new Date();
                fallback.setMonth(fallback.getMonth() + 1);
                const expiresAt = nextBilling || fallback.toISOString();

                await supabaseAdmin.rpc("update_paypal_subscription_renewal_v1", {
                    p_paypal_subscription_id: subscriptionId,
                    p_paypal_transaction_id: txId,
                    p_expires_at: expiresAt,
                    p_paypal_amount: amount,
                    p_paypal_currency: currency,
                    p_conversion_rate: conversionRate,
                });
                } else {
                    throw new Error("Cannot resolve PayPal subscription owner");
                }
            }

            // PAYMENT.SALE.REFUNDED
            // A completed sale was refunded. Mark payment_status so billing records are
            // accurate. Do NOT change status or period_end -- access expires naturally.
        } else if (eventType === "PAYMENT.SALE.REFUNDED") {
            const subscriptionId = String(resource.billing_agreement_id ?? "");
            if (subscriptionId) {
                await supabaseAdmin
                    .from("user_subscriptions")
                    .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
                    .eq("paypal_subscription_id", subscriptionId);
                const { data: refSub } = await supabaseAdmin
                    .from("user_subscriptions").select("id")
                    .eq("paypal_subscription_id", subscriptionId).maybeSingle();
                if (refSub?.id) {
                    await supabaseAdmin.from("subscription_activity").insert({
                        subscription_id: refSub.id, actor_id: null,
                        action: "paypal_payment_refunded",
                        metadata: { paypal_subscription_id: subscriptionId, sale_id: String(resource.id ?? "") },
                    });
                }
            }

            // PAYMENT.SALE.REVERSED
            // A payment was reversed (chargeback). Same safe treatment as refund.
        } else if (eventType === "PAYMENT.SALE.REVERSED") {
            const subscriptionId = String(resource.billing_agreement_id ?? "");
            if (subscriptionId) {
                await supabaseAdmin
                    .from("user_subscriptions")
                    .update({ payment_status: "reversed", updated_at: new Date().toISOString() })
                    .eq("paypal_subscription_id", subscriptionId);
                const { data: revSub } = await supabaseAdmin
                    .from("user_subscriptions").select("id")
                    .eq("paypal_subscription_id", subscriptionId).maybeSingle();
                if (revSub?.id) {
                    await supabaseAdmin.from("subscription_activity").insert({
                        subscription_id: revSub.id, actor_id: null,
                        action: "paypal_payment_reversed",
                        metadata: { paypal_subscription_id: subscriptionId, sale_id: String(resource.id ?? "") },
                    });
                }
            }

            // BILLING.SUBSCRIPTION.PAYMENT.FAILED
            // resource.id is the subscription ID for payment failure events.
        } else if (eventType === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") {
            const subId = String(resource.id ?? "");
            if (subId) {
                await supabaseAdmin.rpc("handle_paypal_payment_failure_v1", {
                    p_paypal_subscription_id: subId,
                    p_reason: "payment_failed_webhook",
                });
            }

            // BILLING.SUBSCRIPTION.CANCELLED / SUSPENDED / EXPIRED
            // resource.id is the subscription ID for lifecycle events.
            // Clears paypal_subscription_id to stop future auto-renewals,
            // but preserves status and current_period_end so paid access is retained.
        } else if (
            eventType === "BILLING.SUBSCRIPTION.CANCELLED" ||
            eventType === "BILLING.SUBSCRIPTION.SUSPENDED" ||
            eventType === "BILLING.SUBSCRIPTION.EXPIRED"
        ) {
            const subId = String(resource.id ?? "");
            if (subId) {
                await supabaseAdmin.rpc("handle_paypal_subscription_cancellation_v1", {
                    p_paypal_subscription_id: subId,
                });
            }
        }

        // Mark event as processed
        await supabaseAdmin.rpc("record_paypal_webhook_event_v1", {
            p_event_id: eventId,
            p_event_type: eventType,
            p_payload_digest: digest,
            p_result: "processed",
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[webhook] Processing error:", msg);
        await supabaseAdmin.rpc("record_paypal_webhook_event_v1", {
            p_event_id: eventId,
            p_event_type: eventType,
            p_payload_digest: digest,
            p_result: "failed",
            p_error_metadata: { message: msg.slice(0, 200), event_type: eventType },
        });
        return json({ error: "Internal processing error" }, 500);
    }

    return json({ success: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /cancel
// Seller-initiated cancellation. Only cancels their own PayPal subscription.
// Preserves access until current_period_end passes (no instant lockout).
// ─────────────────────────────────────────────────────────────────────────────
async function handleCancel(req: Request): Promise<Response> {
    const user = await resolveUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    // Fetch user's own PayPal subscription ID
    const { data: sub } = await supabaseAdmin
        .from("user_subscriptions")
        .select("paypal_subscription_id, current_period_end")
        .eq("owner_user_id", user.id)
        .maybeSingle();

    if (!sub?.paypal_subscription_id)
        return json({ error: "No active PayPal subscription found" }, 400);

    try {
        const token = await getAccessToken();

        // Cancel auto-renewal on PayPal side
        const r = await fetch(
            `${PAYPAL_API_BASE}/v1/billing/subscriptions/${sub.paypal_subscription_id}/cancel`,
            {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ reason: "Seller requested cancellation via Ecom OS Dashboard" }),
            },
        );

        // 204 = success; 422 may mean already cancelled
        if (!r.ok && r.status !== 422) {
            const errText = await r.text();
            console.error("[cancel] PayPal API error:", errText);
            return json({ error: "PayPal cancellation API call failed" }, 500);
        }

        // Clear paypal_subscription_id to prevent future renewals from being applied,
        // but do NOT change status or current_period_end — access preserved until expiry.
        await supabaseAdmin.rpc("handle_paypal_subscription_cancellation_v1", {
            p_paypal_subscription_id: sub.paypal_subscription_id,
        });

        return json({
            success: true,
            access_until: sub.current_period_end,
            message: "Auto-renewal cancelled. Access preserved until billing period ends.",
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[cancel] Error:", msg);
        return json({ error: "Server error during cancellation" }, 500);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main dispatcher
// ─────────────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

    try {
        const path = new URL(req.url).pathname.split("/").pop(); // last segment

        if (path === "create") return await handleCreate(req);
        if (path === "verify") return await handleVerify(req);
        if (path === "webhook") return await handleWebhook(req);
        if (path === "cancel") return await handleCancel(req);

        return json({ error: "Not found" }, 404);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[paypal-subscription] Unhandled error:", msg);
        return json({ error: "Internal server error" }, 500);
    }
});
