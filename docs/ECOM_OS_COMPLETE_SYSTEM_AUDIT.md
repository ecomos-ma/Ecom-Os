# Ecom OS — complete system logic, calculations, statuses and data-flow audit

Audit date: 19 October 2026 (Africa/Casablanca); platform-wide second pass added the same day  
Repository: `D:\ecom os v 1\ecomos56`  
Connected Supabase project: `wxfialbmyfkafobtkrde`  
Mode: **read-only**. No application code, live data, schema, integrations, payments, or deployments were changed.

## 1. Executive summary and evidence standard

Ecom OS is a React/Vite multi-workspace application backed by Supabase/PostgreSQL, Edge Functions, external commerce/advertising/delivery APIs, and a separate WhatsApp worker. An order may be imported by several paths, worked by a confirmation agent, shipped through a carrier, counted in one or more dashboards, and eventually trigger an agent earning. Those stages are **not one atomic, unified workflow**. Different modules use different status fields and different definitions of revenue, delivery, and profit.

The most urgent results are:

1. **Critical authorization gap:** live `orders`, `expenses`, `products`, `transactions`, and assignment policies grant broad workspace-member access. A normal active member can bypass narrower UI/RPC role checks through the database API. This is a within-workspace authorization defect, not evidence of cross-workspace leakage. See [F01](#f01-critical--member-wide-order-and-financial-write-access).
2. **High-risk excessive privileged-function grants:** internal payroll trigger functions are executable by `anon`/`authenticated` in live privilege metadata. Direct trigger-function calls may fail by PostgreSQL design, so exploitability is not established; the grants still merit prompt review. See [F02](#f02-high--internal-security-definer-functions-have-unnecessary-public-grants).
3. **High financial unreliability:** the Expenses P&L order query requests nonexistent columns; Finance omits `shipping_status`; Dashboard, Finance, Team, and Expenses therefore disagree. The field labeled `netProfit` excludes material costs such as agent pay. See F03–F06.
4. **High inventory/return failure:** the live order-status inventory trigger observes the wrong column for its firing condition; the return-to-stock UI marks a flag without incrementing product stock. See F07–F08.
5. **High status corruption:** 679 of 681 observed order rows have a literal SQL-expression-looking value in `delivery_status`, and the live default is malformed. This feeds status precedence and may suppress real confirmed orders in calculations. See F09.
6. **Operational drift:** historical YouCan jobs include 1,708 failures; the local online-assignment migration is absent from live history; TikTok Edge Function source exists but no matching functions are deployed. See F10–F12.
7. **High licensing deployment mismatch:** the new Client Licenses UI and public validation proxy target a data model and `validate` action absent from the connected project. The deployed license function is the older, one-domain implementation. See [F22](#f22-high--client-license-ui-validation-proxy-and-live-backend-do-not-match).
8. **Partial live geography and AI tools:** Live View currently has city-level positions for 184/681 events, no exact positions, and 497 unplotted; the Amine page invokes AI Edge Functions not deployed in this project. See F23–F24.

These are findings, **not permission to change production**. Fixes below are proposals requiring the owner's approval and staged validation.

### Evidence labels

| Label | Meaning |
|---|---|
| **CODE** | Read directly from current source/SQL; a path or object is supplied. |
| **LIVE** | Read-only live schema, policy, function, deployment, or aggregate result from project `wxfialbmyfkafobtkrde`. No individual customer data was extracted into this report. |
| **TEST** | Existing isolated local contract test passed; most such tests inspect code contracts rather than exercising live API traffic. |
| **INFERRED** | Consequence follows from verified code/schema, but the specific failure was not executed against live customers. |
| **UNVERIFIED** | No safe end-to-end observation or sufficient evidence; do not assume it works. |
| **DECISION** | Intended business rule is ambiguous and must be chosen by the owner. |

This audit inspected the repository, relevant live schema/functions/RLS/Edge Function inventory and safe aggregate counts. It did **not** replay production webhooks, send messages, publish ads, charge customers, generate or pay invoices, impersonate agents, mutate rows, or run the 22 scenario cases against live data. Source-code evidence is not equivalent to an end-to-end production guarantee. Line references refer to the checked-out code at audit time; the live SQL definition takes precedence if migration files differ.

### Live baseline (aggregate only)

| Entity | Observed live count / distribution | Interpretation |
|---|---:|---|
| `orders` | 681 | Actual row count; an earlier table-size estimate of 1,313 is not a count. |
| `orders.status` | 473 pending; 122 confirmed; 48 cancelled; 26 blacklisted; 6 delivered; 5 duplicate; 1 scheduled | Confirmation/lifecycle field; not the same as carrier status. |
| `orders.shipping_status` | 591 null; 53 `delivered`; 36 `returned`; 1 `NEW_PARCEL` | Mixed casing/provider vocabulary and many nulls. |
| `orders.delivery_status` | 679 literal `"'pending'::text"`; 1 `WAITING_PICKUP`; 1 `NEW_PARCEL` | Malformed default and rows; not a valid normalized pending value. |
| `products`, `order_items`, `shipments` | 40, 0, 0 | Product catalogue is populated but order-item and shipment ledgers are empty in this project. |
| Live View events | 681 total; 184 city-level coordinates; 497 unplotted; 0 address/direct-coordinate positions | The map does not have precise order pins in current live data. |
| Licensing | 1 active legacy theme-domain license; `client_licenses`, `license_domains`, `license_events` absent | New Client Licenses is source/UI-only relative to this deployed backend. |
| Anti-Fake Orders | 1 store, 2 rules, 0 enabled rules, 5 recorded historical hits | Client-side guard currently has no enabled rule in this project; it is not a network firewall. |
| Notifications | 430 rows project-wide, 427 unread | Aggregate across all workspaces/users, not one seller's unread count. |
| `inventory_movements`, `stock_history` | 0, 0 | No observed movement/history rows; not evidence that stock is correct. |
| `expenses`, `transactions`, `ad_spend`, `shipping_payouts` | 0 each | Financial settlement data is sparse; displayed estimates must not be described as cash received. |
| `meta_legacy_campaigns` | 125 | Cached Legacy Meta campaigns, not proof that current account sync/publishing succeeds. |
| `tiktok_connections` | 0 | TikTok is not connected in this project. |
| `agent_invoices`, `agent_earnings` | 1 issued invoice, 1 invoiced earning | One observed payroll example; zero recorded payments. |
| `workspace_subscriptions` | 19 active; 15 pending activation | Workspace access and subscription state are separate from invoice balances. |
| `youcan_sync_jobs` | 1,708 failed historical; 1,566 completed; 3 retry | Last observed failed order job 19 Oct 2026 00:16 UTC. Exact cause was not determined. |

The previously generated deep payroll audit, [AGENT_INVOICES_TEAM_CONFIRMATION_AUDIT_2026-10-19.md](AGENT_INVOICES_TEAM_CONFIRMATION_AUDIT_2026-10-19.md), has additional rule-by-rule SQL details and evidence. This report checks its important conclusions independently and expands to the full platform.

## 2. Project inventory and application architecture

### Entry points and boundaries

- **Frontend:** React 18, TypeScript, React Router 7, Vite 8. Entry points: `src/main.tsx`, `src/App.tsx`; dashboard desktop/mobile paths include `src/pages/ResponsiveDashboard.tsx`. The router protects pages, but client-side route protection is **not** database authorization.
- **Shared client state:** `src/contexts/OrdersContext.tsx`, `src/contexts/FinanceContext.tsx`, `src/hooks/useDashboardData.ts`, `src/hooks/useOrders.ts`, `src/hooks/useAuth.tsx`.
- **Database/API:** Supabase PostgREST and RPCs; live public schema inventory includes 282 RLS-enabled tables, and 70 deployed Edge Functions. RLS-enabled does not mean role permissions are correct.
- **Server operations:** `supabase/functions/*` contains integration handlers, billing, WhatsApp control, Meta, YouCan, Shopify, shipping and administration functions. Some local functions are not deployed; some deployed function names have no matching local source.
- **Local WhatsApp:** browser `localhost:8080` → Vite `/api/whatsapp-worker/*` proxy → Node worker `127.0.0.1:5000`; production uses `whatsapp-control` Edge Function. See repository `AGENTS.md` and `src/services/whatsappWorkerService.ts`.
- **Background work:** Supabase triggers/RPCs, integration job tables and worker/Edge Function processors; there is no single process orchestrating all order lifecycle stages transactionally.

### Module inventory

Access descriptions below reflect **intended UI/service access**. The broad live RLS issue in F01 overrides narrower UI access for affected tables.

| Module | Main source / principal data | Inputs → output and dependencies | Intended access / observed state |
|---|---|---|---|
| Dashboard/Live View | `src/pages/Dashboard.tsx`, `ResponsiveDashboard.tsx`, `src/hooks/useDashboardData.ts`, `src/lib/metrics.ts`; `orders`, `expenses`, `ad_spend`, products, Meta | Workspace orders and costs → cards, trends, map; depends on imports/status quality | Workspace member; renders, but calculations can diverge from Finance. Live View geolocation is approximate when order data supports it. |
| Orders | `src/pages/Orders.tsx`, `src/contexts/OrdersContext.tsx`, `src/hooks/useOrders.ts`, `src/lib/statusEngine.ts`; `orders`, `order_items` | Manual/imported orders → queue and edits; feeds all operational metrics | Workspace operational users; live 681 orders. Source list limited to 5,000 in shared context. |
| Confirmation/CRM | `src/pages/Confirmation.tsx`, `src/hooks/useConfirmationCRM.ts`, `src/services/confirmationCrmService.ts`, `save_confirmation_order_v1`; `orders`, assignment/activity tables | Assigned orders, calls, status/upsell changes → confirmation results, activity, earnings | Agent/manager by service/RPC; live broad table policy undermines strict route-only control. |
| Team/assignment | `src/pages/Team.tsx`, assignment RPCs in payroll/online-assignment migrations; `team_members`, `order_assignments`, `orders.assigned_to` | Presence, role, manual/automatic assignment → agent queues/workload | Owner/manager for controls; agents see work. Live online balancing migration not confirmed deployed. |
| Agent invoices/payroll | `src/pages/AgentInvoices.tsx`, `supabase/migrations/20260922120000_agent_payroll_and_exclusive_assignment.sql`; rules, earnings, periods, invoices, payments | Confirmation/delivery/upsell events → accrued earnings → invoice lines → recorded payments | Owner/manager manages; agent sees own record. One live 10 MAD issued invoice, zero payments. |
| Finance | `src/pages/Finance.tsx`, `src/contexts/FinanceContext.tsx`, `src/lib/financeEngine.ts`; orders, transactions, expenses, payouts | Order and cash-like records → breakdown, forecast, health score | Workspace financial users; `shipping_status` is dropped during context mapping. |
| Expenses/P&L | `src/pages/Expenses.tsx`, `src/lib/metrics.ts`; orders/items, expenses, ad spend | Delivered sales minus modeled costs → `netProfit`-named card | Financial users; current order select is incompatible with live schema. |
| Shipping/Delivering | `src/pages/Shipping.tsx`, `src/pages/Delivering.tsx`, provider Edge Functions; orders/shipments | Confirmed orders → provider request/tracking → `shipping_status` | Workspace shipping users; live `shipments` table empty. |
| Products/inventory/returns | `src/pages/ProductsAndInventory.tsx`, `src/lib/returnToStock.ts`, stock SQL triggers; products, orders, stock history | SKU and status aggregates → stock/valuation; return scan → flag/history | Inventory operators; product stock and derived stock can diverge. |
| Customers | `src/pages/Customers.tsx`; customers, orders | Customer links and delivered orders → lifetime value | Workspace member; unlinked orders excluded. |
| Ads Manager / Legacy Meta / Launch Studio | `src/pages/AdsManager.tsx`, `LegacyAdsManager.tsx`, local Meta launch source, `supabase/functions/meta-legacy/index.ts`; Meta connection/campaign tables | Meta API → cached campaigns/results; launch workflow → campaign/ad set/ad request | Authorized ad operators; 125 legacy campaigns cached; publishing not exercised. |
| TikTok Ads | `src/pages/TikTokAds.tsx`, local `supabase/functions/tiktok-*`; connection/insight tables | OAuth/token and API sync → metrics | UI/source exist; zero connections and matching Edge Functions not deployed. |
| YouCan | `supabase/functions/youcan-*`, `_shared/youcan.ts`; integrations, jobs, order/item tables | Webhooks/reconcile → idempotent jobs/upserts → orders/products | Integration admins; historical failed jobs require investigation. |
| Shopify | `supabase/functions/shopify-webhook/index.ts`; connections, orders | Signed webhook → order upsert/status mapping | Integration admins; payment status currently influences confirmation status. |
| Google Sheets | `google-sheets-webhook`, `sync-google-sheets-fast`, `sync-google-sheets-orders`; credential, sync and order tables | Mapped rows → workspace-scoped order upsert using sync key | Integration admins; 6 static contract tests passed, runtime import unverified. |
| Carriers | `coliaty-webhook`, `sendit-webhook`, Ameex/ForceLog/Ozon Edge Functions; orders, provider logs | Provider status → normalized `shipping_status` and tracking | Shipping configuration/operators; no carrier callback was triggered by audit. |
| WhatsApp | worker `whatsapp-worker/src/*`, `whatsapp-control`; connection, queue, messages | Local/production connection → QR, queue, send/delivery events | Workspace WhatsApp operators; no live message sent by audit. |
| Notifications / errors | notification SQL/functions and Error Center pages; notification/error tables | Events/failed operations → user alerts/logs | Workspace recipient/platform admin by policy; complete runtime delivery not tested. |
| Billing/subscriptions | `src/pages/settings/billing/*`, `src/hooks/useAuth.tsx`, `paypal-subscription`; subscriptions/payment requests | Payment verification → workspace access entitlement | Owner/platform billing; no payment initiated. |
| Platform admin | `src/pages/admin/AdminPro.tsx`, `PlatformAdminRoute`, admin Edge Functions | Platform-wide management, including client-license area | Platform permissions; not equivalent to workspace ownership. |

### Dependency map

```text
YouCan / Shopify / Google Sheets / manual UI / WhatsApp order creation
                    │
                    ▼
            orders (+ source-specific item/job tables)
              ├────► Confirmation CRM ──► assignment/activity ──► Team cards
              │                               │
              │                               └────────► agent earnings/invoices
              ├────► Shipping/provider requests ──► shipping_status/tracking
              │                                       ├────► inventory/returns
              │                                       └────► agent delivery earnings
              ├────► Dashboard/Live View/Customers
              └────► Finance/Expenses/P&L
Meta/TikTok/ad spend ──────────────────────► advertising cards and modeled profit
Transactions/expenses/payouts ─────────────► Finance (not one reconciled ledger)
Subscriptions + membership ───────────────► route access and RLS helpers
```

## 3. Data model, lineage, and source-of-truth boundaries

| Entity | Keys/relationships and important fields | Source of truth / caveat |
|---|---|---|
| `orders` | Primary key is **`"Order ID"` UUID**, not `id`; `workspace_id` FK; source IDs including `external_order_id`, `youcan_order_id`, `sync_key`; `order_number`; `status`, `shipping_status`, `delivery_status`, `total`, `shipping_cost`, `assigned_to`, `confirmed_at`, `returned_to_stock` | One shared order row with several independent status concepts. Unique indexes include `(workspace_id, external_order_id)`, `(workspace_id, sync_key)`, `(workspace_id, youcan_order_id)`, `(workspace_id, order_number)` and `(workspace_id, content_hash)`. Not every source populates every field. |
| `order_items` / `youcan_order_items` | `order_items.order_id` references `orders."Order ID"`; source-specific YouCan item table links workspace/integration/order/external line ID | Live generic `order_items` is empty; `order_items.sku` does not exist. Product costs from item joins are unavailable for these live orders. |
| `products` / stock history | Workspace products, cost/price/stock counters; movements/history tables | Live 40 products, zero movement/history rows. Some UI stock is derived from order status rather than stored stock. |
| `order_assignments` / confirmation activity | Order, workspace, agent, timestamps/events | Assignment history can differ from current `orders.assigned_to`; different pages use different source. |
| Payroll | Rule → immutable-ish earning key → earning → invoice line → invoice → payment allocation/acknowledgment/dispute | Unique earning key prevents ordinary duplicate accrual; overlapping periods and late accrual remain risks. |
| Financial ledgers | `expenses`, `transactions`, `ad_spend`, `shipping_payouts`, subscription payment records | Distinct ledgers; no single reconciled profit/cash source. Four operational finance tables were empty in live baseline. |
| Integrations | Connections, sync state, queues/logs/campaign cache | Remote platform remains source for ad spend/status; local cache date and sync failure matter. |

**Lineage examples (CODE):**

1. YouCan webhook → delivery-id check/job queue → `_shared/youcan.ts` status/field mapping → `youcan-reconcile` upsert on workspace/source ID → `orders` and `youcan_order_items` → Confirmation, Dashboard, Finance, inventory views. Job failure/retry is persisted; live failed backlog exists.
2. Google Sheets row → mapping/validation → `sync_key` → workspace-scoped order upsert → confirmation queue and reports. A retry with a stable key should update rather than duplicate; exact row semantics require runtime test.
3. Agent Save & next → `save_confirmation_order_v1` authorization and row lock → `orders.status`/timestamps/upsell fields and activity → confirmation summary, Team cards and earning trigger. The UI then animates to the next loaded order; animation is not proof that all downstream projections finished.
4. Carrier webhook → signature/token validation → provider mapping → `orders.shipping_status`, tracking raw data and sync timestamp → delivery metrics/payroll; stock trigger currently does not respond correctly to that write.
5. Payment confirmation → subscription RPC/webhook → subscription status/entitlement → `resolve_workspace_access_v1` on login; this does not settle COD order cash.

No cross-workspace records were combined in the aggregate examples. Aggregate live counts above describe the whole project, **not** a particular seller workspace, and should not be compared to a workspace-specific UI card.

## 4. Calculation dictionary — what the code actually computes

### Orders, Dashboard and sales

| UI metric / implementation | Formula, source, scope/date and exclusions | Caveat/evidence |
|---|---|---|
| Orders list/count | `OrdersContext` loads workspace orders, up to 5,000; `useOrders` groups `order.status` after `statusEngine` normalization. | `src/contexts/OrdersContext.tsx:104-158`, `src/hooks/useOrders.ts`; not a lifetime database count above limit. |
| Order total | Manual entry stores submitted `total`; YouCan imports `total_price`; Sheets maps configured column. There is no universal shared `sum(items) - discount + shipping` recalculation across sources. | `src/pages/Orders.tsx:636-721`, `_shared/youcan.ts:266-392`; amounts depend on source semantics. |
| Quantity / product mix | Product page uses `Number(order.quantity) || 1` while item-level reports would use item quantity. | `src/pages/ProductsAndInventory.tsx:78-302`; live `order_items=0`. Null, zero and invalid quantity become 1. |
| Dashboard date scope | Database query by `created_at` within selected range, then hook filters by `order_received_at || created_at`; desktop dashboard also filters by `created_at`. | `src/hooks/useDashboardData.ts:185-418`, `src/pages/Dashboard.tsx:215-425`. Backdated imports can be excluded before client filtering. |
| Dashboard status counts | Desktop derives counts from status text/regex; common profit engine prefers `shipping_status || delivery_status || status`. | `Dashboard.tsx:215-425`, `src/lib/metrics.ts:131-163`; cards can disagree on the same order. |
| Shared confirmation rate | `confirmedCount / totalOrders × 100`; confirmed identified by engine normalized status. | `src/lib/metrics.ts:137-294`; zero denominator → 0. With malformed `delivery_status`, status precedence can hide `orders.status='confirmed'`. |
| Shared delivery rate | `deliveredCount / confirmedCount × 100` in shared metrics. | `src/lib/metrics.ts`; not the Team or Finance denominator. |
| Average order value | Defined only where a view explicitly divides a selected amount by a selected order count; no single canonical platform AOV function was found. | **UNDEFINED** as a platform-wide business contract; do not quote one AOV without page/date/status definition. |

### Cost, profit, Finance and cash

| Metric | Actual formula / filter | Caveat/evidence |
|---|---|---|
| Shared delivered revenue | Sum of `order.total` for orders whose resolved status is delivered. | `src/lib/metrics.ts:149-172`; status resolution prefers shipping, then delivery, then order status. It is **recognized sales estimate**, not COD cash collected. |
| Product cost | For each delivered order, item cost × quantity when joined item/product cost exists, otherwise SKU/product fallback; missing cost defaults to 0 with warning. | `src/lib/metrics.ts:172-222`; live generic item table empty, so fallback/zero matters. |
| Shipping cost | Delivered order's recorded cost in seller mode; missing value warned, not replaced with a verified carrier settlement. | `src/lib/metrics.ts:172-255`; Finance forecast separately assumes 35/order when missing. |
| Operational fees | Rule amount × qualifying count; in seller mode, shipping/delivery-named rules are skipped to avoid obvious duplicate shipping cost. | `src/lib/metrics.ts:222-283`; configuration semantics matter. |
| Ad spend | Dashboard: Legacy Meta report if connected; otherwise active campaign summed spend if positive; otherwise `ad_spend` rows. | `src/hooks/useDashboardData.ts:185-418`; Meta report has ~2.5s timeout and account currency may not be MAD. This is precedence, not a reconciled ledger. |
| `netProfit` in common engine | `deliveredRevenue - productCost - shippingCost - operationalFees - adSpend`; margin=`netProfit/revenue×100`. | `src/lib/metrics.ts:285-300`. Agent pay, actual taxes, many expense categories, settlement adjustments and some returns are not included. Therefore this is **partial contribution margin**, not reliable net profit. |
| Expenses page result | Common engine result minus one-off expense total; ad spend/one-offs queried separately. | `src/pages/Expenses.tsx:164-231`. Order query asks for nonexistent `orders.id` and `order_items.sku`, so its P&L may be empty/misleading. Expense queries have no matching end-date filter. |
| Finance gross / delivered / pending | `financeEngine` classifies current orders into gross, delivered, pending, cancelled, returned; expected pending=`pending × estimated deliveryRate /100`. | `src/lib/financeEngine.ts:92-119` and later summary functions. `FinanceContext.tsx:65-221` removes `shipping_status`, so classification can differ from source rows. Buckets are not guaranteed to be a disjoint accounting partition. |
| Finance delivery/return rate | Delivery rate=`delivered/(delivered+cancelled+returned)×100` when resolved; otherwise default 65%. Return rate=`returned/resolved×100`. | `src/lib/financeEngine.ts`; 65% is a planning assumption, not observed performance. |
| Finance cash flow | Inflow=`deliveredRevenue + transactions income`; outflow=`transactions expense`; flow=inflow−outflow. | Potential double counting if COD collected is also recorded as an income transaction. No live transactions or payouts observed. This is not bank-reconciled cash. |
| Forecast / health | 30-day projection based on observed rates and expenses; missing shipping-cost fallback 35 per delivered order; weighted health heuristic. | `src/lib/financeEngine.ts`; model estimate, not booked accounting result. |
| Customers lifetime value | Sum delivered order totals for linked `customer_id`, accepting `shipping_status='delivered'` or order status delivered plus one malformed localized string. | `src/pages/Customers.tsx:61-106`; unlinked orders are omitted. |
| Return loss / COD settlement | No verified, consistently populated end-to-end calculation tying carrier payout, fee, refund, product loss and cash receipt to each order. | **PARTIAL/UNVERIFIED**; live `shipping_payouts=0`, `transactions=0`, `shipments=0`. |

### Team, compensation, inventory and ads

| Metric | Actual formula and scope | Evidence / risk |
|---|---|---|
| Team assigned/confirmed | Current `orders.assigned_to` count; confirmed count includes current `confirmed`, `shipped`, `delivered`; rate=`confirmed/assigned×100`. | Team page and [deep payroll audit](AGENT_INVOICES_TEAM_CONFIRMATION_AUDIT_2026-10-19.md); reassignment changes historical-looking cards. Live 5/20=25% in the inspected assigned subset. |
| Team contacted / no-answer / review | Contacted excludes null/new/pending; no-answer includes no_answer/unreachable/wrong_number; review includes cancelled/refused/blacklisted/duplicate/out_of_stock. | Team source definitions differ from Confirmation cards (which include busy in no-response). |
| Team delivery rate/revenue | `delivered/(delivered+coming_back)×100`; revenue=sum total for delivered assigned orders. | Live inspected subset 1/(1+0)=100%, not delivered/assigned. |
| Calls / first response | Calls=count `CALL_STARTED`; average response=mean(first call-start timestamp minus order creation); session duration=latest minus earliest activity today. | These are recorded activity measures, not actual phone answer time or true online duration. |
| Confirmation summary | RPC status counts; `to confirm=pending+new`; no response=no_answer+unreachable+busy; confirmed rate=currently confirmed/total; confirmed today uses `confirmed_at`. | `src/services/confirmationCrmService.ts`, Confirmation page; differs from Team on denominator/status vocabulary. |
| Per-confirmed/per-delivered earning | Fixed enabled rule amount per qualifying confirmed order or normalized delivered order. | `sync_agent_order_earnings_v1`; unique earning key and `ON CONFLICT DO NOTHING` prevent ordinary duplicate accrual, not all correction errors. |
| Upsell commission | Fixed amount, or `round((upsell_value ?? order.total)×percentage/100,2)`, capped if configured. | UI writes `upsell_value` as **final adjusted total**, not incremental delta; owner must decide intended base. |
| Fixed salary / response bonus | Full salary rule per applicable payroll period, no proration. Bonus uses mean `CALL_STARTED.created_at - order.created_at`, threshold <30s and at least 10 calls in current UI rule. | Not actual call answer time. Overlapping payroll periods possible. |
| Invoice / balance | Accrued earnings inside `[period_start,period_end)` summed; generated adjustment=0; invoice lines snapshot rules; `paid=sum(recorded allocations)`; remaining=`max(0,total-paid)`. | One live invoice: 10 MAD amount, 0 MAD payments, 10 MAD remaining. Late earning/reversal and overlapping periods require controls. |
| Product-page stock | `current_stock=initial_stock−delivered`, `ready_to_ship=max(0,current_stock−out_for_delivery−returned)`; product `profit=price−cost`, margin relative to price, valuation=`ready_to_ship×cost`. | `src/pages/ProductsAndInventory.tsx:78-302`; a **derived view** differing from DB product stock. Returned orders are not reliably added back. |
| Meta results | Meta action/result values from API; `cost_per_result=provider field or spend/results`; account spend/reach/impressions/clicks from cached sync/report. | `supabase/functions/meta-legacy/index.ts:754-900`; attribution and currency depend on Meta. |
| OAuth Ads Manager CPA/ROAS | CPA=`spend/orders`, costDelivered=`spend/delivered`, deliveryRate=`delivered/orders`, ROAS=`attributed revenue/spend` only if attribution deemed reliable; `netProfit=campaign net_profit−spend`. | `src/pages/AdsManager.tsx:411-476`; not the same as shared profit. |
| TikTok metrics | CTR=`clicks/impressions`; CPC=`spend/clicks`; CPM=`spend/impressions×1000`; cost/conversion=`spend/conversions`; ROAS hidden on currency mismatch. | `src/pages/TikTokAds.tsx:182-283`; live connection count 0 and backend deployment gap. |
| Subscription state | Stored statuses drive entitlement; UI `expiring` is derived from remaining days, not a stored status. | `src/pages/settings/billing/billingShared.ts:48-80`, `src/hooks/useAuth.tsx:512-583`; do not confuse paid request with active access. |

For ratios, a zero denominator is generally displayed as 0 or a placeholder rather than an exception; do not compare ratios across modules unless their denominator, scope, date, currency and status definitions are identical. The source has **no single authoritative metric dictionary or accounting ledger**.

## 5. Status dictionary and transition matrices

### Distinct status systems

| System / stored field | Values observed or accepted | Actors and downstream effects | History/validation |
|---|---|---|---|
| Confirmation/lifecycle `orders.status` | UI canonical keys: `new`, `pending`, `confirmed`, `scheduled`, `no_answer`, `unreachable`, `wrong_number`, `busy`, `cancelled`, `refused`, `out_of_stock`, `blacklisted`, `duplicate`, `shipped`, `delivered`, `returned`. Confirmation RPC allows 13 of these, excluding `shipped`, `delivered`, `returned`. | Agent via `save_confirmation_order_v1`; imports/webhooks and other order pages also write. Drives queue, Team, payroll and some analytics. | DB text default `pending`, no restrictive status CHECK observed; RPC validates membership/assignment and accepted value but not a full from→to graph. Activity/history exists for CRM; not all direct writes are forced through it. |
| Carrier `orders.shipping_status` | Canonical 20-code vocabulary from `src/lib/shippingStatus.ts` (`NEW_PARCEL`, `WAITING_PICKUP`, `PICKED_UP`, `RECEIVED_AT_WAREHOUSE`, `IN_DISTRIBUTION`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CUSTOMER_UNREACHABLE`, `NO_ANSWER`, `PHONE_OFF`, `WRONG_ADDRESS`, `RESCHEDULE_REQUESTED`, `REFUSED`, `DELIVERY_FAILED`, `RETURNED_TO_AGENCY`, `RETURN_TO_DEPOT`, `RETURN_IN_PROGRESS`, `RETURNED_TO_SENDER`, `CANCELED`); live also lower-case `delivered`/`returned`. | Shipping UI and carrier callbacks. Feeds delivery, inventory, Customers and per-delivered payroll. | Free text and provider mappings; no common monotonic transition guard was verified. Tracking raw/status timestamps vary by provider. |
| Legacy/fallback `orders.delivery_status` | Intended carrier-like status; live mostly literal `"'pending'::text"`. | Some views use it ahead of `orders.status` whenever nonempty. | Malformed live default and 679 rows; cannot treat as valid `pending`. |
| Normalized analytics bucket | `NEW`, `CONFIRMED`, `READY`, `OUT_FOR_DELIVERY`, `DELIVERED`, `COMING_BACK`, `PROCESSED`. | `src/utils/status.ts` maps several raw/provider labels for product/Team analytics. | Unknown labels fall to `NEW`; `return done`/`return completed` map to `DELIVERED` (dangerous ambiguity). |
| Assignment | Current `orders.assigned_to`, historical assignment ledger / ownership mode | Manual/auto assignment/reassignment changes queue; current-assignee Team cards update. | Ledger exists; live assignment RPC and local migration versions differ. |
| Earning/invoice/payment | Earnings `accrued`→`invoiced`; invoices include `issued`, `partially_paid`, `paid` in current path; payment `recorded`; acknowledgment `received_full`, `not_received`, `received_different`. | SQL payroll functions/RPCs and owner UI. | Unique earning key, payment allocations and audit records; corrections/reversals incomplete. |
| Integration job | YouCan `pending`, `processing`, `retry`, `completed`, `failed`, `cancelled`; other integrations have separate sync/log states. | Webhook/reconcile workers, scheduled sync. | Delivery ID/idempotency key; failures persist and need operational monitoring. |
| Subscription | `user_subscriptions`: `pending_payment`, `under_review`, `active`, `grace`, `expired`, `suspended`, `cancelled`; payment request: `unpaid`, `submitted`, `reviewing`, `paid`, `rejected`, `waived`; workspace subscription has its own state. | Owner/payment workflow and access resolver. | `expiring` UI is calculated from days remaining, not a DB status. |
| WhatsApp | Worker connection `disconnected`, `initializing`, `qr_required`, `authenticated`, `ready`; message queue includes `pending`, `processing`, `sent`, `delivered`, `read`, `failed`, `cancelled`, `skipped`. | Worker/WhatsApp callbacks; notifications/automation. | Polling 1.5s while connecting and 5s otherwise locally; not part of order confirmation status. |
| Ads publishing | Meta campaign/ad set/ad objects have remote statuses plus local queue/snapshot state. | Launch Studio/Legacy Meta backend and Meta API. | Local workflow source and live Meta publishing migrations exist; no real ad was published by audit. |

**Key rule:** neither `orders.status='confirmed'` nor a carrier `DELIVERED` event means a COD payment has been collected. `orders.status` is a confirmation/lifecycle field; `shipping_status` is a logistics field; `delivery_status` is a legacy/fallback field that currently contains invalid values. Treating them as interchangeable causes several findings below.

### Verified transition paths, including failure boundaries

| Current → trigger | Validation / writer | DB change and side effect | Result / gap |
|---|---|---|---|
| Absent → manual order creation | Orders form accepts submitted fields and workspace context. | Inserts `orders`, usually pending; then views refresh. | No universal recalculation from item lines. Duplicate prevention differs from external imports. |
| Absent/existing → YouCan webhook or reconcile | Signed/identified integration path, delivery/job dedup, workspace and source ID. | Job queued; reconciler upserts `orders` and `youcan_order_items`. | Status mapping may set `confirmed` for paid/processed, `delivered` for closed; failed jobs persist. No audit-triggered live import. |
| Absent/existing → Google Sheets row | Configured mapping, workspace, stable `sync_key`. | Upsert `orders`; sync logs. | Runtime dedup under retries not executed; key collisions/configuration must be tested. |
| Absent/existing → Shopify webhook | HMAC verified; workspace/shop/order mapping. | Upsert order; financial `paid`/`partially_paid` may set `orders.status='confirmed'`; fulfillment affects shipping field. | Paid is not proof of a human COD confirmation; needs owner rule. |
| `pending`/other → agent Save | `save_confirmation_order_v1` checks auth, workspace membership, confirmation permission, agent assignment, valid one of 13 statuses, sane total; row locked. | Writes order status, `confirmed_at` and related confirmation/upsell fields as appropriate; records activity; earning triggers may act. | No full transition matrix: e.g. a prior confirmed order may be cancelled; stale timestamp/earning reversal needs inspection/test. |
| Unassigned/assigned → manual or auto assign | Assignment/ownership RPCs; role/presence intended. | Changes current `assigned_to` and assignment ledger. | Team cards use current assignee; historical credit and earnings may not follow reassignment consistently. Live online equal-share migration absent. |
| `confirmed` → shipping request/manual update | `src/pages/Shipping.tsx:71-190` lists only `order.status === 'confirmed'`, provider credentials/selection. | Provider request/tracking or direct `orders.shipping_status` update. | Orders with `orders.status='delivered'` are not in this queue; `.eq('order_number', ...)` without explicit workspace predicate is an avoidable defense-in-depth gap. |
| Any shipping state → provider webhook | Coliaty query token or Sendit HMAC; provider-specific mapping. | Updates `shipping_status`, raw payload, last sync/tracking fields. | No common verified sequence-number/monotonic guard; duplicate/out-of-order delivery callback behavior is **UNVERIFIED**. |
| In transit → delivered/returned | Carrier/manual update to shipping status. | Delivery dashboards and per-delivered earnings may change. | Live stock trigger fires on `status`, not shipping-status update: stock effects fail (F07). COD settlement remains separate and unverified. |
| Return received → return-to-stock UI | QR/modal selects order, currently sets `returned_to_stock`. | Inserts stock-history entry with `quantity_change=0`; flag becomes true. | Stored product stock does not rise (F08); flag can misrepresent completion. |
| Confirmed/delivered → payroll rule | Order/confirmation activity and payroll SQL. | Idempotent earning key inserts `accrued` earning. | A later correction does not reliably reverse an existing earning; invoice reconciliation needed. |
| Accrued → invoice generation | Owner payroll action, period lock/validation. | Rechecks delayed delivery, sums accrued earnings in period, creates invoice/lines, marks earnings invoiced. | Late earning after closing and overlapping periods can leave results inconsistent. No live invoice created by this audit. |
| Issued/partial → payment recording | Owner permission, positive amount, locked invoices, matching agent/workspace, allocation sum and remaining-balance checks. | Payment/allocations, invoice status, audit event. | Safe idempotency and real transfer reconciliation still need isolated testing; no payment recorded by audit. |
| Subscription payment submitted/paid → access | Server payment confirmation and entitlement RPC. | Payment request/subscription fields; access resolver reads status. | Payment status and access status are different; no payment attempted. |

### Status edge cases and reversibility

- **Pending forever:** no guaranteed SLA/escalation or forced assignment was verified for all source paths. The queue will show pending/new, but a failed import job can stop before an order exists.
- **Repeated save:** same status can be saved again; `ON CONFLICT DO NOTHING` prevents a duplicate earning key but does not prove no duplicate activity, external notification or stale timestamp. Runtime test required.
- **Cancelled after confirmed / return after delivered:** code permits some corrections because there is no single guarded transition graph; already accrued/invoiced commission and stock are not automatically reversed end-to-end.
- **Reassignment:** current workload changes immediately; historical effort is in activity/assignment ledgers; different reports credit current assignee versus event actor.
- **Unknown provider value:** shipping is free text; one analytics normalizer falls back to `NEW`; original value should be preserved and surfaced, not silently treated as a valid new parcel.
- **Out-of-order callback:** no platform-wide version/time guard was verified. A stale provider event could overwrite a later state; this is a risk, not an observed incident.
- **Partial failure:** webhook queue commit, order upsert, local projections, stock and dashboards do not share one transaction. Recovery depends on each integration's retry/idempotency and operator monitoring.

## 6. End-to-end order lifecycle as implemented

```text
External store/Sheet/manual entry
  └─ authentication + workspace mapping + source-ID/content dedup
       └─ [possibly asynchronous job/retry] orders row, usually pending
            └─ assignment (manual/auto; current assignee + ledger)
                 └─ agent contact/activity + confirmation status
                      ├─ cancelled/refused/no answer/duplicate → queue/reporting
                      └─ confirmed → shipping UI/provider request
                           └─ tracking + shipping_status callbacks
                                ├─ delivered → modeled revenue + possible agent earning
                                └─ failed/return → return processing/stock flag
                                     └─ separate carrier settlement/COD/financial ledgers
            └─ Dashboard, Customers, Finance and Expenses each recompute from subsets
                 └─ agent payroll period → invoice → recorded transfer/allocation
```

| Stage | Actual trigger/write and boundary | Financial, stock and notification consequence |
|---|---|---|
| Source capture | Manual form or YouCan/Shopify/Sheet/WhatsApp source; integration verifies its own auth/signature. | Source price, discount, shipping amount and order time are mapped differently. No revenue/cash should be booked simply because an order row exists. |
| Dedup/workspace | Composite unique source IDs, YouCan job idempotency, webhook delivery ID or Sheets sync key; workspace comes from connection/configuration. | Prevents some duplicates, but cross-channel same customer/order may still duplicate without shared identity. |
| Initial status | Source mapping or default `pending`; malformed `delivery_status` default also populated. | Can change queue and report eligibility before an agent acts. |
| Assignment/contact | Agent assignment and activity tables; no external telephone event is inferred unless recorded. | Team workload, response time and some commission attribution depend on this record. |
| Confirmation | RPC persists selected status, price/upsell and confirmation timestamp. | Confirmed order is eligible for shipping/possible earning, not delivered sales. Save & next is a UI transition. |
| Shipping request | Shipping page lists confirmed orders; provider function may create tracking. | `shipments` ledger is empty live; tracking/fees may live on order/provider fields. No COD cash is inferred. |
| Delivery callback | Provider mapping writes shipping status and tracking data. | Dashboard/Team/Customers may count delivery differently. Stock trigger does not currently apply expected updates; commission may accrue. |
| Return/stock | Manual QR/modal marks `returned_to_stock` and writes zero-quantity history. | Product stock not reliably restored; return loss/fee not reconciled. |
| COD and settlement | Separate transaction, payout, provider and expense flows. | No verified order→carrier remittance→bank reconciliation. Empty live ledgers make cash claims unsupported. |
| Reporting/payroll | Each page queries or derives different subsets; payroll generates invoices from accrued earnings. | Retroactive corrections can leave previously issued invoices unchanged. |

## 7. Team, agent and payroll workflow

An invited member belongs to a workspace with role/section permissions. `src/hooks/useAuth.tsx` resolves access through `resolve_workspace_access_v1`; agents/supervisors may get membership access without being billing owners. The intended Confirmation RPC checks authenticated identity, role/section, workspace and current assignment. Assignment can be shared/separated, manual, auto or round-robin depending on settings and deployed migration. The local online equal-share version should **not** be described as live behavior until deployment and parity are verified.

The Team page builds cards from **currently assigned orders**. The Confirmation summary uses a server RPC and the latest assignment ledger with fallback. That is why agent totals can differ. Calls are `CALL_STARTED` activity rows, not independently verified telephony contacts; first response and session duration are timestamp-derived proxies. Reassignment changes current Team attribution; payroll earning records use the attribution and rule at accrual time. Credit policy for a worker who contacted an order before reassignment is a business decision.

Payroll rules currently include per-confirmed, per-delivered, fixed/percentage upsell, custom fixed metrics, fixed salary and a call-start-based response bonus. Each qualifying event uses a unique earning key. The generator rechecks delayed delivery, includes accrued earnings whose `earned_at` is in `[start,end)`, creates snapshot lines, sets amount to their sum plus a generated adjustment of zero, and marks earnings invoiced. Live example: one enabled 10 MAD-per-delivered rule, one qualifying delivered order, one issued 10 MAD invoice, no payment, 10 MAD remaining. This is a **small live example**, not proof all payroll rules work.

The payment RPC verifies all allocations against the same workspace and agent, locks invoices, disallows allocation above outstanding balance, and requires allocations to equal the payment amount. An agent may acknowledge full receipt, no receipt or a different amount; disputes can be opened. Private proof storage uses short-lived signed viewing URLs. Gaps: overlapping periods, late earnings after invoice closure, no reliable reversal on status correction, fixed salary without proration, and ambiguous upsell commission base. See the [dedicated payroll audit](AGENT_INVOICES_TEAM_CONFIRMATION_AUDIT_2026-10-19.md) for SQL function-level detail.

## 8. Finance reconciliation: what is and is not money

1. **Order total** is submitted/imported expected sale value. It is not a payment.
2. **Delivered revenue** is a status-based estimate of delivered order totals. A carrier may mark delivered before remitting COD, and there may be returns/corrections later.
3. **Finance inflow** adds delivered revenue to recorded income transactions; if COD remittance is also entered as income, the same economic value may be counted twice.
4. **Expenses P&L** subtracts modeled product/shipping/operational/ad/one-off cost but its current order query is invalid against live schema. `netProfit` cannot be relied upon as true net profit even after the query is repaired because agent payroll, taxes, fees and settlement differences are not comprehensively included.
5. **Agent invoice** is a payable liability from earning events. Recording a transfer reduces invoice balance but is not automatically the same as a Finance expense/cash transaction. Automatically adding both earning accrual and transfer as expense later would double count unless one accounting convention is chosen.
6. **Subscriptions** are platform billing and access control, not merchant COD order settlements.

For any requested monthly number, the owner must specify: workspace, order date versus delivery date versus payment date, currency, refund/return treatment, and whether the answer means gross bookings, delivered value, booked profit, payable agent commission or actual cash in bank. The application currently does not enforce one answer to those questions.

## 9. Integrations, mappings, freshness and failure modes

| Integration | Authentication/workspace, mapping and storage | Sync/dedup/retry and verified operating state |
|---|---|---|
| YouCan | Integration-linked workspace; `_shared/youcan.ts:266-392` maps raw closed/fulfilled/completed/delivered → `orders.status=delivered`; processed/processing/confirmed/paid/captured → confirmed; refunded/returned → returned; cancellation → cancelled; others → pending. Total/discount/shipping are imported. | `youcan-webhook` dedups delivery ID; `youcan-reconcile:197-260` upserts orders by workspace+YouCan ID and separate `youcan_order_items` by workspace/integration/order/external line. Job states support retry and error logging. **LIVE:** 1,708 failed historical jobs (937 order, 767 product, 4 checkout), 1,566 completed, 3 retry; investigate errors without replaying production blindly. 17 contract tests passed. |
| Shopify | HMAC-checked webhook and workspace connection. `shopify-webhook/index.ts:67-122` maps paid/partially_paid → confirmation `confirmed`, refunded → `returned`, voided → cancelled; fulfilled/partial fulfillment → logistics state. | Upsert by workspace/external order ID. Payment-based `confirmed` is a business/semantic risk for Moroccan COD. Deployment inventory also includes `shopify-orders-webhook` without a matching local source path: parity review needed. No runtime Shopify event was sent. |
| Google Sheets | Configured credential/mapping; `google-sheets-webhook`, `sync-google-sheets-fast`, `sync-google-sheets-orders` map rows to workspace orders and preserve source time where available. | Workspace+`sync_key` upsert and sync logs; 6 contract tests passed. Exact schedule, permissions, mapping quality and live retry/dedup are **UNVERIFIED**. |
| Legacy Meta / Launch Studio | Manual encrypted account connection and Meta API; `meta-legacy/index.ts:754-900` syncs campaign metrics and account reports. Launch Studio source and live publishing migrations exist. | 125 cached legacy campaigns live. Cached presence is not proof of fresh sync, pixel/page access, permission to publish, or successful ad creation. No publish was attempted. Remote campaign/ad set/ad object must be verified together on isolated test account before claiming end-to-end readiness. |
| OAuth Meta Ads Manager | Separate OAuth-style manager source in `src/pages/AdsManager.tsx`; attribution estimates and account-currency spend. | Not interchangeable with the manual Legacy Meta connection. Runtime connection state not independently verified here. |
| TikTok Ads | UI and seven local `tiktok-*` Edge Function directories (auth start/callback, advertisers, sync, events, refresh, disconnect). | **LIVE:** zero `tiktok_connections` and no deployed Edge Function whose name begins `tiktok`; source-only/partial in this project. 11 code-contract tests passed, not runtime availability. |
| Coliaty | `coliaty-webhook/index.ts:24-53` checks a configured token from URL query and maps provider statuses around lines 167-204. | Writes shipping status/tracking/log data. Query-string token can leak via URL logging. Duplicate and out-of-order handling not proven. |
| Sendit | `sendit-webhook/index.ts:12-105` uses HMAC with workspace-specific secret and provider status mapping. | Conditional on configured secret/connection; no callback exercised. Ameex, ForceLog and Ozon have separate Edge sources/normalizers. |
| WhatsApp | Local proxy/worker Bearer secret stays server-side; production `whatsapp-control` Edge path. Worker has QR/auth/ready state machine and message queue processor. | Automation queue and delivery/read callbacks are asynchronous; local setup documented in `AGENTS.md`. No message was sent. A displayed connected state is not proof of a delivered customer message. |
| PayPal/subscription | `paypal-subscription` server flow/webhooks and entitlement RPC; workspace is associated server-side. | No payment attempted. Distinguish submitted/paid payment request, active subscription and actual workspace-access resolution. |

Integration reliability requires reporting **connected**, **last successful sync**, **last attempted sync**, **failed/retry queue size**, **external permissions**, **mapping version** and **data freshness** separately. A connection card or cached campaign is not a successful current sync. Source and deployment inventories must be compared before enabling a feature.

## 10. Security and workspace isolation

### Confirmed live policy defect

The live tables use RLS, but the relevant policies are permissive. `orders_tenant_select` and equivalent policies on `expenses`, `products`, `transactions` allow `is_active_workspace_member(workspace_id)`. Insert/update/delete policies use `workspace_operational_access_v1(workspace_id)`. The live definitions of those helper functions check active membership and operational subscription access, **not** owner/manager role, per-agent order assignment or finance/product section permission. The `authenticated` role also has table SELECT/INSERT/UPDATE/DELETE privileges on those tables and `order_assignments`. Therefore an authenticated active workspace member can directly call PostgREST with broader power than the intended UI or `save_confirmation_order_v1` exposes. Multiple permissive policies are OR-combined, so a narrower extra policy does not cancel the broad one.

**Scope:** within a workspace the member legitimately belongs to; the inspected policy does use workspace membership and is not itself proof of cross-tenant data leakage. A member of multiple workspaces can act in each unless narrower role restrictions are added. No exploit or personal data read was performed. Evidence: live `pg_policies`, table privileges, live helper definitions; source migration `supabase/migrations/20260901090000_multitenant_store_subscription_repair.sql:322-413` reproduces the broad pattern. The `order_assignments` live ALL policy likewise uses workspace membership, so assignment history writes need review. This is more than a frontend-guard problem and should be fixed first, with tests for owner, manager, agent, unrelated member and external workspace.

### Other security observations

- Internal `SECURITY DEFINER` trigger functions `sync_agent_event_earnings_v1` and `sync_agent_order_earnings_v1` are executable by `anon` and `authenticated` in live function privilege metadata. Source: `supabase/migrations/20260922120000_agent_payroll_and_exclusive_assignment.sql:679+`. Trigger-only functions may error on direct invocation, so successful abuse was **not** demonstrated; their public EXECUTE grants should nevertheless be removed after dependency testing. The confirmation RPC is not executable by `anon` and has its own checks.
- Live security advisor returned many broad advisories: 44 RLS-enabled tables with no policy (often legitimate server-only tables), 64 mutable function search-path warnings, 159 anonymous and 272 authenticated SECURITY DEFINER execution warnings, three extensions in public, and one leaked-password-protection warning. Those counts are **screening flags**, not 539 proven exploitable vulnerabilities. Review by function/table and privilege before changing them.
- Some Edge Functions correctly validate HMAC/signatures; Coliaty uses a query token, which is more exposure-prone. Integration secrets, Meta tokens, WhatsApp worker secret and service-role credentials were not copied into this report.
- `Shipping.tsx` updates by `order_number` without an explicit `.eq('workspace_id', ...)`; RLS is intended to protect other workspaces, but using both keys would reduce accidental multi-workspace collisions.
- Role checks in React components and route guards are usability controls; they cannot compensate for direct database access permitted by RLS. Every privileged RPC/Edge Function needs its own authorization path.
- A separate isolated two-workspace/agent-role security suite passed 5 static tests. It does **not** refute the live broad policy: it does not exercise the current live RLS under role-specific sessions.

## 11. Severity-ranked findings and discrepancies

Each item states observed evidence and impact separately. “Fix” is a recommendation, not an authorized change.

### F01 CRITICAL — member-wide order and financial write access

**LIVE/CODE:** `orders_tenant_*`, `expenses_tenant_*`, `products_tenant_*`, `transactions_tenant_*` live policies plus `workspace_operational_access_v1`/`is_active_workspace_member`; source migration `20260901090000_multitenant_store_subscription_repair.sql:322-413`. Active member + active owner subscription is enough for relevant DML; no role/section/assignment check. **Impact:** an ordinary agent can potentially mutate/delete operational and financial rows inside their workspace through direct API access, bypassing UI restrictions and audit RPCs. **Next:** design role-specific restrictive policy/RPC boundary, test every role in an isolated clone, audit historical writes. Do not simply disable RLS or remove all member reads.

### F02 HIGH — internal SECURITY DEFINER functions have unnecessary public grants

**LIVE:** `anon` and `authenticated` have EXECUTE grants on internal earning trigger functions including `sync_agent_event_earnings_v1`, `sync_agent_order_earnings_v1`. **Impact:** unnecessary privileged grants and an expanded review surface; direct invocation of a PostgreSQL trigger function normally fails outside trigger context, so this observation alone is **not proof of exploitable access**. **Next:** revoke public/anon/authenticated EXECUTE from internal trigger-only functions where safe, explicitly grant only true API RPCs, and test triggers/payroll in staging. Triage other advisor warnings individually.

### F03 HIGH — Expenses P&L selects columns that do not exist

**CODE/LIVE:** `src/pages/Expenses.tsx:171` selects `orders.id` and `order_items.sku`; live `orders` PK is `"Order ID"` and `order_items` has no `sku`. Query error is not surfaced as a blocking failure. **Impact:** empty/misleading revenue and profit card despite orders. **Next:** use actual schema and explicit error state, then reconcile against fixed fixture totals.

### F04 HIGH — Finance discards the shipping status before calculating revenue

**CODE/LIVE:** `src/contexts/FinanceContext.tsx:65-221` maps order fields without `shipping_status`; `src/lib/financeEngine.ts:92-119` expects it. Live: 53 orders have shipping `delivered`, only 6 have order status delivered, and `delivery_status` is malformed for most. **Impact:** Finance delivered revenue and rates differ from Dashboard/Team and may severely undercount. **Next:** preserve the logistics field, define canonical delivered meaning, back-test workspace-specific reconciliations.

### F05 HIGH — `netProfit` is not full net profit

**CODE:** `src/lib/metrics.ts:172-300` calculates delivered revenue minus product, shipping, selected operational fees and ad spend; it does not comprehensively include agent earnings/payments, taxes, actual carrier settlements and return losses. Expenses subtracts some one-offs separately. **Impact:** financial decision-making on an overstated/understated number. **Next:** relabel current figure as modeled contribution margin until a reconciled accounting contract is approved; choose accrual versus cash treatment to avoid double-counting agent pay.

### F06 HIGH — Dashboard, Finance, Expenses and Team use different status/currency/date definitions

**CODE:** `useDashboardData.ts:185-418`, `Dashboard.tsx:215-425`, `financeEngine.ts`, `FinanceContext.tsx`, `Expenses.tsx`, Team/payroll audit. Legacy Meta account spend may be in account currency and enter a MAD-named profit model without conversion; time windows use `created_at`, `order_received_at`, delivery/earning timestamps inconsistently. **Impact:** incompatible totals presented as if equivalent. **Next:** owner-approved metric contracts per card, currency normalization and shared query tests.

### F07 HIGH — inventory trigger cannot react to normal shipping-status updates

**LIVE:** `order_status_inventory_trigger` fires **after update of `status`**, while its current live `update_product_inventory_on_order_status` function checks whether `OLD.shipping_status` differs from `NEW.shipping_status` and returns otherwise. Provider and shipping UI update `shipping_status` only. Source migration `056_products_inventory_unified.sql:80-168` shows older status-based logic; live differs. **Impact:** automatic product stock/history does not change on the usual delivery/return path. **Next:** design a single transactional stock-event model and stage historical reconciliation before touching trigger or counters.

### F08 HIGH — return-to-stock marks completion without restoring stock

**CODE:** `src/lib/returnToStock.ts:173-263` initializes `totalQty=0`, sets `orders.returned_to_stock=true`, writes stock history with `quantity_change=totalQty`, but never increments that variable or updates product stock. **LIVE:** zero stock-history/movement rows, no returned-to-stock orders observed. **Impact:** returned products can remain unavailable while UI says restocked. **Next:** do not reinterpret old flags as proof of actual inventory movement; reconcile physical return, quantities, product IDs and idempotency in staging.

### F09 HIGH — malformed `delivery_status` default pollutes status logic

**LIVE:** default is the literal text `'''pending''::text'::text`; 679/681 rows contain `"'pending'::text"`. **CODE:** `src/lib/metrics.ts:131-163` prefers `shipping_status || delivery_status || status`; `src/utils/status.ts` maps unrecognized nonempty value to `NEW`. **Impact:** an order that is `confirmed` with null shipping status can be treated as `NEW` by an analytics path (32 such confirmed rows were observed). **Next:** fix default/backfill only after staging reconciliation, and make status resolution ignore invalid fallback values.

### F10 HIGH — YouCan synchronization has a substantial failed-job backlog

**LIVE:** 1,708 historical failed jobs, including 937 order jobs; 3 current retry jobs, with a failed order job observed on 19 Oct 2026. **CODE:** `youcan-webhook`/`youcan-reconcile` persist failures and retries. **Impact:** source orders/products may be missing or stale. **Next:** classify errors, find last good per integration/workspace, fix underlying causes, then safe idempotent replay in controlled batches; do not bulk retry blindly.

### F11 HIGH — online equal-share assignment version is not live

**CODE/LIVE:** local 20261018 online-assignment migration is absent from deployed migration history; live assignment RPC does not contain its stronger online-agent target validation. **Impact:** the requested one-online-agent-all, two-online-agents-50/50 and owner-excluded behavior cannot be claimed as deployed. **Next:** compare live/local schema and RPCs, test distribution, presence expiry, owner exclusion and manual override before migration.

### F12 MEDIUM — TikTok appears in UI/source but backend is undeployed

**CODE/LIVE:** seven local `tiktok-*` function directories, zero deployed matching Edge Functions, zero connections. **Impact:** TikTok connection/sync pages cannot be presented as an operating integration in this project. **Next:** decide whether to deploy after configuration/security tests or clearly mark unavailable.

### F13 HIGH — Shopify paid status is conflated with human confirmation

**CODE:** `supabase/functions/shopify-webhook/index.ts:67-122` maps paid/partially_paid → `orders.status='confirmed'`. **Impact:** COD/agent confirmation queue may be bypassed and confirmation rates inflated for Shopify orders. **Next:** owner must define whether prepaid Shopify orders bypass calls; separate payment and confirmation fields if not.

### F14 MEDIUM — historical metrics and agent pay are not correction-safe

**CODE:** current-assignee Team cards, unique-key earnings, period invoice generation. **Impact:** reassignment/status correction can change card history but leave earning/invoice history; late delivery earnings may miss a closed period, overlapping periods can double invoice fixed salary. **Next:** define credit/reversal policy and immutable adjustment ledger, disallow period overlap, reconcile existing invoices before migration.

### F15 MEDIUM — carrier and return semantics can count a return as delivered

**CODE:** `src/utils/status.ts:23-100` maps `return done`/`return completed` to `DELIVERED`. **Impact:** under those provider labels, sales/stock/commission may be overstated if the normalized value reaches delivered-dependent reports. **Next:** distinguish delivered-to-customer versus returned-to-sender terminal events in owner-approved mapping tests.

### F16 MEDIUM — date/query limits and source timestamp mismatch

**CODE:** shared order context caps at 5,000, Dashboard products at 100, active Meta campaign subset at 50; Dashboard initial query filters `created_at` before using `order_received_at` client-side. **Impact:** later scale or late imports cause incomplete charts/counts. **Next:** server-side aggregate/pagination with explicit event-date semantics; test >5,000 orders.

### F17 MEDIUM — cash-flow and payroll are separate, potentially double counted

**CODE:** Finance cash flow adds delivered value plus transaction income; payroll records earning/invoice/payment separately. **LIVE:** transaction/payout tables empty. **Impact:** once accounting entries are added, COD or agent payments could be represented twice or not at all. **Next:** owner-approved chart of accounts and explicit linking/reconciliation between orders, carrier remittance, payroll accrual and bank transfer.

### F18 MEDIUM — integration/source and runtime drift

**CODE/LIVE:** Shopify deployed function without local matching source; local TikTok undeployed; local online-assignment migration missing live; older inventory migration differs from live function. **Impact:** reading repository alone cannot predict production behavior, and deployment may overwrite hotfixes or omit dependencies. **Next:** build a deployment parity manifest and migration checksum process before any release.

### F19 MEDIUM — direct shipping update lacks explicit workspace predicate

**CODE:** `src/pages/Shipping.tsx:71-190` updates by `order_number`. **Impact:** RLS currently limits tenant exposure, but an operator with multiple workspace memberships and colliding order numbers could update more than intended. **Next:** include both workspace ID and stable order PK, check exactly one row returned.

### F20 MEDIUM — Coliaty secret travels in URL

**CODE:** `supabase/functions/coliaty-webhook/index.ts:24-53`. **Impact:** proxy/access logs and copied URLs may expose a webhook credential. **Next:** evaluate provider support for signed headers or rotate and redact/log-suppress query token.

### F21 LOW — Customers lifetime-value localization is brittle

**CODE:** `src/pages/Customers.tsx:61-106` includes a malformed `"livrÃ©"` comparison in delivered detection and depends on `customer_id` linkage. **Impact:** customer value can be understated. **Next:** normalize status and customer identity centrally after the higher-risk status issues are fixed.

### F22 HIGH — Client License UI, validation proxy and live backend do not match

**CODE/LIVE:** `src/pages/admin/ClientLicenses.tsx` and `src/lib/clientLicensing.ts:93-116` call the `theme-domain-licensing` function for client/domain/event records, recovery and custom unauthorized messages. `api/theme-license/validate.ts:31-42` sends `action: "validate"`. In the connected project, `client_licenses`, `license_domains`, `license_events` and default-message table do not exist; the deployed `theme-domain-licensing` v4 source uses `theme_domain_licenses` and supports `verify`, not `validate` or the client actions. One active legacy row exists. **Impact:** the new dashboard, import/restore, multiple-domain validation and dynamic unauthorized message cannot work against that live backend; the public proxy cannot authorize through the old action. The preexisting legacy verification path may still work and must be preserved. **Next:** migration/secret/function/proxy parity review and staging tests, with legacy-key preservation and rollback, before any deployment. Do not rotate or overwrite the existing key.

### F23 MEDIUM — Live View location precision is much lower than the UI concept implies

**CODE/LIVE:** `src/hooks/useLiveView.ts:15-97` refreshes via `get_live_view_snapshot_v1`, subscribes to Realtime, requests geocoding and reconciles every 60 seconds. `src/services/liveViewService.ts:54-99` handles the RPC and geolocation function. Live `live_view_events`: 681 rows, 184 plotted from city coordinates, 497 unplotted, zero address/direct-coordinate rows. **Impact:** a globe may be attractive while most real orders cannot be placed and every current pin is city-level, not a customer's precise location. **Next:** verify address quality and geocoder deployment/configuration with privacy-preserving staging orders; keep unknowns unplotted and label precision honestly.

### F24 MEDIUM — Amine AI buttons target Edge Functions not deployed here

**CODE/LIVE:** `src/pages/Amine.tsx:70-97` invokes `ai-generate-script` and `ai-generate-landing-page` directly. The connected project has 70 deployed functions, but neither those nor `ai-analyze-product`, `ai-route`, `ai-router` is deployed; `tools-api` is deployed and is a different path. **Impact:** Sawty/landing AI actions in Amine are not backed by the named live endpoints. Other tools are client-side or call third-party APIs directly. **Next:** verify product decision and secrets/quotas before deploying AI functions; mark unavailable until a staging request succeeds.

### F25 MEDIUM — COD Scenarios break-even calculation undercounts other cost

**CODE:** `src/pages/CodScenarios.tsx:6-105` simulates 100 orders. `totalCosts` uses `otherCost = 100 × otherCostPerOrder`, but the closed-form `minDelivered` calculation sets `constFixed = adCost + 100×fulfillmentFee + 100×returnShippingCost + otherCostPerOrder` (one order's other cost, not 100). **Impact:** break-even delivered orders/rate can look too optimistic when other per-order cost is nonzero. This page uses user-entered local simulation values, not actual sales records. **Next:** unit tests with nonzero other cost and impossible break-even scenarios; label the page as a simulation.

### F26 MEDIUM — notification feed may repeatedly refetch when paginated

**CODE/INFERRED:** `src/pages/Notifications.tsx:43-90` defines `load` with `cursor` as a dependency, and its effect depends on `load`. `listNotifications` returns a newly created `nextCursor` object whenever there are more than 30 rows (`src/services/notificationService.ts:36-67`). A normal first-page load can therefore set a new cursor, recreate `load`, retrigger the effect and fetch the same first page repeatedly. **Impact:** excessive traffic and unstable loading for recipients with >30 visible notifications. Not runtime reproduced; project-wide 430 rows do not prove a particular recipient exceeds 30. **Next:** isolated component test with 31 rows; separate first-page reload callback from pagination cursor.

### F27 MEDIUM — Shipping toggle does not guard the Delivering route

**CODE:** `src/App.tsx:453-470` protects `/delivering` using `permission="orders"`, while `/shipping` uses `permission="shipping"`; `src/components/PermissionGuard.tsx:33-38` checks `isShippingModuleEnabled` only for `permission === "shipping"`. `src/pages/Delivering.tsx` imports that helper but does not call it. **Impact:** disabling the Shipping module can hide/block Shipping while Delivering remains reachable to users with Orders permission. **Next:** owner decides whether Delivering is part of Shipping; align route, sidebar and page guards, then isolated toggle tests.

### F28 MEDIUM — Meta Launch Studio submission is a queued job, not a verified publication

**CODE:** `src/pages/MetaLaunchStudio.tsx:389-440` uploads missing creatives then enqueues one `bulk_launch` job per campaign with `defer_processing: true`; it shows a queued toast and a `Launch submitted` UI state. **Impact:** users may interpret submission as Meta approval/live delivery. A remote campaign, ad set, ad, creative and final activation each need independent status verification; no publish was attempted in this audit. **Next:** show queue/processing/partial failure/Meta accepted/active statuses separately and exercise a test ad account after explicit approval.

## 12. Validation performed and the 22-scenario test matrix

### Isolated tests actually run

The following existing local suites completed successfully without live writes: `npm run test:team` (23), `test:youcan` (17), `test:tiktok` (11), `test:google-sheets` (6), `test:multitenant` (5), `test:anti-fake` (7), `test:settings` (27), `test:notifications` (19), `test:licenses` (9) and `test:live-view` (11): **135/135 passing**. These are primarily code/contract tests and do not prove deployed parity, real API credentials, provider callbacks, live RLS role isolation, or correct financial totals. In particular, the license contract suite reads local source while the live backend is older (F22). No production records changed. Typecheck/lint/build were not rerun as part of this read-only audit; their status is **UNVERIFIED**, not assumed green.

The matrix below states what was observed, not merely what ought to happen. “CODE ONLY” is not an end-to-end pass. All database-change cells are **none from this audit**. A future isolated staging fixture is needed for actual transition and reconciliation assertions.

| # / scenario | Preconditions and expected implementation path | Actual observation / result | Risk or next isolated check |
|---|---|---|---|
| 1. Normal import | Valid connected source/workspace, new external ID → mapping/upsert pending or mapped status. | YouCan/Sheets source and contract tests inspected; no import executed. **CODE ONLY/UNVERIFIED runtime.** | Staging import asserts one order, correct workspace, amounts, time and items. |
| 2. Duplicate import | Same source ID/delivery ID/sync key retried → update/ignore, not second order. | Unique keys and YouCan/Sheets code verified; no retry executed. **CODE ONLY.** | Test duplicate from each channel and cross-channel identity separately. |
| 3. Confirmation transition | Assigned agent saves allowed status → locked RPC writes status/time/activity. | RPC source/live signature inspected; no live save. **CODE ONLY.** | Staging role and activity assertions. |
| 4. Invalid transition | Unauthorized/invalid status must reject. | RPC rejects value outside its allowed set; it does **not** implement full from→to transition graph. **PARTIAL: invalid value protected, invalid sequence not proven.** | Test confirmed→pending/cancelled and stale timestamps. |
| 5. Reassignment | Manager moves order → current assignee and ledger update. | Code/Team suite, live migration drift found. **UNVERIFIED runtime.** | Assert queue exclusivity, historical activity, credit and owner exclusion. |
| 6. Cancel after confirmation | Agent/admin correction accepted or rejected by policy. | No full transition guard in RPC; payroll reversal absent. **RISK INFERRED.** | Test timestamp, stock, commission and shipping eligibility. |
| 7. Delivery success | Signed carrier event → `shipping_status=DELIVERED` → revenue/earning/stock. | 53 live shipping-delivered rows; inventory trigger mismatch confirmed. **PARTIAL/stock failure inferred.** | Staging callback plus exact stock and ledger assertion. |
| 8. Delivery failure | Provider maps failure/refusal → return bucket. | Mapping source inspected; no event replay. **CODE ONLY.** | Assert not recognized as delivered revenue and no delivered commission. |
| 9. Return after delivery | Later return event should reverse relevant effects. | Code permits status changes; no unified reversal. **UNVERIFIED/known design gap.** | Test revenue, stock, earning/invoice adjustment. |
| 10. Stock after return | Authorized scan should increment correct SKU exactly once. | `returnToStock.ts` writes zero quantity and flag. **FAIL by code inspection.** | Fix only after reconciled physical inventory fixture. |
| 11. Duplicate carrier webhook | Repeated signed event should not duplicate history/earnings. | No common provider idempotency guarantee verified. **UNVERIFIED.** | Replay same event twice in staging. |
| 12. Out-of-order carrier events | Older event arrives after delivered/returned; later state should remain authoritative. | No common monotonic guard verified. **UNVERIFIED.** | Stage reversed timestamps and provider sequence IDs. |
| 13. Missing product cost | Delivered order without item/product cost should warn and not silently claim exact profit. | Shared metrics uses zero fallback with warning. **CODE ONLY.** | Assert warning and label contribution margin, not full net profit. |
| 14. Agent invoice creation | Eligible accrued earning in period → one line/invoice and earning invoiced. | One live 10 MAD invoice observed; no audit-created invoice. **LIVE example, not general pass.** | Staging all rule types, overlaps and late earning. |
| 15. Partial invoice payment | Amount/allocations matching same agent/workspace and ≤balance → partially paid. | RPC validation inspected; no payment made. **CODE ONLY.** | Stage double-submit/idempotency and actual transfer acknowledgment. |
| 16. Finance date filter | Selected period consistently filters orders/expenses/ad spend by chosen event date. | Dashboard/Expenses fields and end-date behavior diverge. **FAIL by code inspection.** | Fixture at month boundary, import lag and different currencies. |
| 17. Dashboard vs Finance totals | Same workspace/date/status definition should reconcile. | Finance drops shipping status; live statuses diverge. **FAIL by code/live evidence.** | Compare fixed order cohort after canonical mapping. |
| 18. Two workspaces | Separate memberships and source connections must isolate rows. | Workspace FKs/RLS and 5 source contract tests; no impersonated live reads. **CODE ONLY.** | Exercise staging sessions for each role/workspace. |
| 19. Unauthorized cross-workspace | Member of A must not read/write B; agent in A must not write financial rows in A. | Cross-workspace condition looks membership-scoped; within-workspace role checks are broadly permissive. **Cross-workspace UNVERIFIED; within-workspace authorization FAIL by policy.** | Role-matrix PostgREST tests; avoid live exploit. |
| 20. Failed integration sync | Error stored with retry/alert and no partial duplicate. | 1,708 live failed YouCan jobs observed; error causes and partial writes uninspected. **LIVE failure state, outcome UNVERIFIED.** | Classify queue, snapshot failure groups, stage one deterministic error. |
| 21. Retry after error | Same idempotency key should eventually complete once. | Job states/unique keys inspected; 3 live retry jobs. **CODE ONLY/UNVERIFIED outcome.** | Stage failure then retry; assert exact once per entity. |
| 22. Historical status correction | Correction should update current metrics and reconcile prior stock/earning/invoice with audit trail. | Current-status cards recalculate; issued earnings/invoices do not have unified reversal. **PARTIAL/likely FAIL for full financial reconciliation.** | Stage confirmed→cancelled and delivered→returned after invoice closure. |

Supplemental second-pass checks, separate from the requested 22 cases:

| Scenario | Observation and result | Required isolated proof |
|---|---|---|
| Legacy key after Client License deployment | One active legacy record exists; new schema absent and deployed function is old. **UNVERIFIED future migration.** | Exact original key verifies before and after migration; archive→lookup→restore reactivates the same key without theme edits. |
| New multi-domain license and unauthorized copy | Nine local contract tests pass; live tables/action absent. **FAIL deployed parity.** | Stage two domains, disabled/archive/foreign hostname, safe default/custom text, no internal-data leak. |
| Live View real coordinate | 184/681 events have city-level plots, none exact. **LIVE partial.** | A consented staging order with valid delivery address yields a non-cached verified coordinate and keeps address private. |
| Meta Launch Studio publication | Jobs can be queued by source; live job table empty. **UNVERIFIED remote publish.** | Test account verifies campaign→ad set→ad→creative, schedule, paused/active result, retry and partial failure. |
| AI script/landing generation | Named Edge Functions called by Amine are not deployed. **FAIL deployed parity.** | Authorized staging invoke, quota/provider error path and secret handling. |
| Notification pagination / Shipping toggle | Potential refetch loop by code; Delivering route not gated by shipping flag. **INFERRED/guard discrepancy.** | Component test with 31 recipient rows; route test with `shipping_enabled=false` and direct URL. |

### Other missing/partial functionality established by evidence

- **Missing or undeployed:** TikTok server functions in this project; local online balancing migration; a canonical COD settlement/reconciliation flow; a comprehensive return-loss and payroll-adjustment accounting bridge.
- **Partial:** stock movement, post-invoice correction, consistent metric semantics, cross-provider status monotonicity, operational monitoring of failed integration jobs, source/deployment parity.
- **Unverified despite source/UI:** current Meta ad publishing, Google Sheets live import/retry, Shopify delivery path, actual carrier webhook dedup, WhatsApp customer delivery, PayPal end-to-end activation, global admin client-license runtime.

## 13. Recommended order of work — proposal only

No fixes were made. Obtain explicit approval before each change group, especially RLS, financial formulas, stock and production migrations.

| Priority | Safest scoped work | Staging gate / rollback concern |
|---|---|---|
| P0a | Snapshot live schema/policies; fix F01 role/section/assignment authorization on sensitive tables and assignment ledger. | Automated role × workspace × operation matrix; preserve owner/manager workflows. Policy changes can unexpectedly deny production users, so stage, observe and plan rollback. |
| P0b | Remove unnecessary public EXECUTE from internal SECURITY DEFINER functions (F02), triage actual exploitable functions. | Trigger and payroll regression tests; no broad blanket revoke without dependency inventory. |
| P0c | Keep the existing legacy license usable while planning migration of Client Licenses UI, tables, secrets, function and public proxy together (F22). | Stage original-key verification, multi-domain changes, archive→import→restore and unauthorized message with no customer theme rebuild; rollback must preserve the current active legacy key. |
| P1a | Define owner-approved order/confirmation/shipping/payment status contracts and canonical date/currency semantics. | Fixture covering source imports, correction, delivery, return and unknown statuses. Do not silently reclassify live orders. |
| P1b | Repair malformed delivery default/rows (F09) with dry-run counts, backups and per-workspace reconciliation; make analytics reject invalid fallback. | Compare pre/post cohort counts, no accidental confirmation or pay accrual. |
| P1c | Repair Expenses invalid select and Finance shipping projection (F03/F04), relabel partial profit (F05), align Dashboard/Finance definitions (F06). | Snapshot comparison by workspace and date; alert on missing cost/currency, verify no double counting. |
| P1d | Redesign delivery/return stock events (F07/F08), inventory reconciliation and idempotency. | Physical stock sample + order-event ledger; migration must not apply historical delivery twice. |
| P1e | Classify/recover YouCan failed jobs; verify deployment parity (F10/F11/F18). | Reconcile IDs and counts before bounded replay; stage direct provider calls. |
| P2 | Correction-safe agent earnings/invoices, periods, cash/expense linking; Shopify payment semantics (F13/F14/F17). | Owner-approved accounting policy; invoice snapshots and legal payment records must remain auditable. |
| P3 | TikTok/AI deployment decisions, provider sequence/idempotency, query-token hardening, pagination, Customer LTV normalization, Live View geocoding accuracy, COD simulator and notification pagination. | Feature-specific integration test environment and visibility/monitoring. |

### Migration risks

1. **Backfill:** 679 malformed delivery values must be interpreted against each order's shipping and confirmation history, not bulk replaced with `DELIVERED` or blindly overwritten if a real provider state exists.
2. **Stock:** current product counters, derived UI stock and physical goods can disagree. A trigger change can double-subtract already processed orders unless an event ledger and cutoff are defined.
3. **Payroll:** issued invoices and payments are financial records. Do not recalculate them in place; use adjustments/credit notes with audit trail after owner approval.
4. **RLS:** tightening member-wide policies can break API paths that incorrectly rely on them; stage test service-role and agent/manager paths separately. Never solve by disabling RLS.
5. **Integration replay:** failed YouCan jobs may have partial side effects; verify uniqueness and destination state before retry. Remote API rate limits and webhooks may arrive during replay.
6. **Metric changes:** dashboard numbers will change when status/date/currency definitions are corrected. Prepare historical before/after reconciliation, owner communication and alert thresholds.
7. **Deployment drift:** apply source migrations only after diffing live definitions, grants, triggers and deployment versions. Avoid applying a local older function over a newer live hotfix.
8. **License continuity:** the existing one-domain row has only a hash, not an encrypted displayable original code. Preserve its identity/hash, require the actual original key for safe re-import, verify customer theme behavior before and after, and do not invent a replacement key or promise recovery from a hash alone.

### Business decisions the owner must approve

1. Does `confirmed` mean an agent verified the customer, or can store payment/YouCan processing automatically qualify?
2. Which carrier event constitutes revenue recognition, and when is COD cash actually recognized?
3. Is commission credited to current assignee, original confirmer, delivery-time assignee, or split by activity? What happens on reassignment/return/cancellation?
4. Is upsell percentage based on **final order total** (current behavior) or only incremental uplift?
5. Are fixed salaries prorated for partial periods, and can periods overlap? How are late earnings settled?
6. Are agent earnings expenses at accrual, invoice issuance, or payment? How is the transfer linked without double counting?
7. What is the base currency for profit, and which dated FX rate converts Meta/TikTok/account spend?
8. Should a returned-to-sender shipment ever count as delivered sale? Which physical event makes stock sellable again?
9. Which date defines each report: order placed, imported, confirmed, delivered, carrier paid, or bank received?
10. What roles may read all workspace orders and mutate products, transactions, expenses or assignments directly?
11. For legacy theme licenses whose original key is not stored recoverably, who can supply the exact key, and what should happen if it is unavailable? Does “archive” temporarily stop the theme while “revoke” permanently blocks simple restoration?

### Acceptance criteria for a future implementation

- Every sensitive table/RPC passes isolated tests for owner, manager, agent, unaffiliated authenticated user and anonymous user across two workspaces; agents cannot bypass assigned-order/section restrictions via direct API.
- A documented status model separates confirmation, logistics, payment and return; unknown/provider-stale values are preserved and flagged, and transitions have reproducible activity records.
- Import retry creates exactly one order per source key; failed jobs expose cause and can be replayed safely.
- One fixed order fixture reconciles Dashboard, Finance, Expenses, Team and Customers for the **same explicit metric**, period, workspace and currency, while legitimately different metrics are labeled differently.
- Confirmed/delivered/returned/corrected transitions produce exactly one auditable inventory movement; returned-to-stock cannot be marked complete without a positive validated quantity and product match.
- An issued invoice retains its original lines; corrections produce explicit adjustments; payment allocations never exceed balance or cross workspace/agent.
- COD cash is shown only after an actual settlement/transaction link; modeled delivered revenue is never labeled bank cash.
- Local migration/function manifest matches deployed project, and all enabled integrations pass their own isolated connection, permission, sync, retry and freshness checks.
- The 22 scenarios above are rerun as automated staging integration tests with before/after rows and no production side effects.
- Client-license deployment passes an original-key continuity test: adding/removing domains and editing unauthorized copy never rotates the key; archive→import→restore re-enables the same theme; revoked cannot be casually restored; the public response contains no phone, price, notes, hash or audit data.

## 14. Plain-language explanation for the owner

Your platform receives orders from stores, Sheets, manual entry and some messaging workflows. It stores a workspace-linked order, then a confirmation agent can call the customer and set a confirmation result. A confirmed order can be sent to a delivery company. The carrier later sends logistics updates such as in transit, delivered or returned. Those updates feed reports and may generate agent commission. Separately, the platform can issue an agent invoice, record a transfer, show advertising figures, and control seller subscriptions.

The important catch is that those are **separate records and separate clocks**. “Confirmed” means a customer/order decision, “delivered” means a logistics result, and “paid” means money movement. A customer order can be delivered while the confirmation field remains confirmed, or be marked delivered by one integration before the carrier status arrives. At present, different pages choose different fields, so the same group of orders can produce different delivered counts or profit figures. A green page or connected account does not prove the entire chain is synchronized.

Team cards count the orders assigned **now** and show a 25% confirmation rate for the inspected 5-of-20 subset. Confirmation cards use another summary and date logic. Agent pay is rule-based: for the one live rule, one qualifying delivery produced 10 MAD of earnings and a 10 MAD invoice; no payment has been recorded. A reassignment or later return does not safely rewrite that invoice automatically. Finance's “cash” and the common “net profit” should be treated as estimates until order delivery, actual carrier remittance, agent compensation, ad currency and expenses are reconciled.

The ten first issues to address are F01 broad member permissions, F22 live Client License mismatch, F09 broken delivery default, F03 invalid Expenses query, F04 Finance missing shipping status, F05 incomplete profit, F07 stock trigger mismatch, F08 broken return-to-stock, F10 YouCan failures, and F11 assignment deployment drift. Review F02 privileged-function grants in the first security pass as well. Start with **security and a staging snapshot**, protect the existing license, then define status/metric rules, then reconcile stock and integration recovery. This order prevents a cosmetic reporting fix from masking unsafe data access or compounding incorrect inventory.

**Bottom line:** the system has substantial real functionality, but production financial, stock and agent-pay numbers should be treated as provisional until the evidence-backed gaps above are resolved. This audit is complete as a read-only investigation; it is **not** a certification that every external provider or workflow has been runtime-tested. No corrective action was taken without approval.

## 15. Platform-wide second pass: exact routes, permissions and operating surfaces

The primary router is `src/App.tsx:169-715`. Public marketing/legal/auth pages do not use the seller workspace layout. Seller routes sit inside `ProtectedRoute` plus `OrdersProvider`, `NotificationProvider` and `Layout`; most then use `PermissionGuard`. `ProtectedRoute` checks session, active profile and operational subscription access. Platform admin is a separate `PlatformAdminRoute` around `/admin/*`; `/super-admin/*` is only a compatibility redirect to `/admin`. These are **UI gates**; the live RLS defect F01 must be fixed independently.

| Route/group | Entry, guard and actual purpose | Server/data boundary and operating state |
|---|---|---|
| `/`, `/features`, `/pricing`, `/integrations`, `/contact`, `/landing-page/:id` | Public marketing, feature/pricing and published landing-page entry points (`App.tsx:170-375`). | Do not treat displayed marketing examples as operational data. |
| `/login`, `/auth/callback`, `/reset-password`, `/invite`, plan/payment/wait/expired/disabled pages | Auth, invitation, subscription/payment onboarding and denial states. | `useAuth.tsx:155-590` resolves session/profile, workspace membership, `resolve_workspace_access_v1` and team permissions. Accepted agent/supervisor membership can grant UI access even without a personal subscription; server policies still decide data operations. |
| `/setup` | Five-step workspace checklist: account, workspace, store, shipping and team (`SetupWorkspace.tsx:10-69`). | Store check uses YouCan status or any Sheets credential; shipping uses any provider row or workspace enabled flag; team count >1. Completion is a browser `localStorage` key, not proof an import or carrier request succeeded. |
| `/dashboard`, `/orders`, `/live-view`, `/confirmation`, `/whatsapp` | Core operations, guarded by dashboard/orders/confirmation section permissions. | Orders and status paths detailed above. Live View is a separate event projection (F23); WhatsApp queue is asynchronous. |
| `/delivering`, `/shipping` | Delivery operations; first guarded by Orders, second by Shipping. | Shipping module flag only blocks Shipping path today (F27). Provider callbacks write logistics status, not customer payment. |
| `/customers`, `/anti-fake-orders`, `/products-inventory`, `/products-inventory/:id` | Customer value, storefront visual guard, SKU/stock, product detail. | Customer LTV depends on linked delivered orders; Anti-Fake is a browser script, not WAF; stock issues F07–F08. |
| `/ads-manager`, `/ads-manager-legacy`, `/ads-manager/launch-studio` | OAuth Meta analytics, manual Legacy Meta account, drag-to-build launch flow. | Legacy studio is embedded on Legacy Ads Manager; `/ads-manager-legacy/launch-studio` redirects back to legacy page. Publish queues backend jobs, not immediate success (F28). |
| `/tiktok-ads`, `/expenses`, `/finance`, `/agent-invoices` | Advertising, P&L, modeled finance, payroll. | TikTok unavailable live; financial definitions differ. `/agent-invoices` has no route-level `PermissionGuard`, but page filters owner/agent and backend RLS/RPC must enforce access. |
| `/scenario`, `/team`, `/settings`, `/notifications`, `/tools`, `/amine` | COD simulator, assignment/performance, workspace config/integrations/billing, notification center, Amine media/AI tools. | `/cod-scenarios` redirects to `/scenario`; `/tools` and `/amine` render the same Amine page. Some AI functions are undeployed (F24). |
| `/admin/*` | Command Center; users, sellers, workspaces, orders, products, campaigns, billing/plans/payment methods, intelligence, operations, support, communications, platform settings, AI console, errors, deletion requests, legal settings and client licenses (`AdminPro.tsx:20-45`). | `PlatformAdminRoute` and per-action platform permissions; administrator data comes from protected founder RPCs or admin tables. Client Licenses live mismatch F22. |
| `/privacy`, `/terms`, `/refund-policy`, `/data-deletion`, `/account-deletion`, `/security`, `/subprocessors` | Public legal/privacy information and a public deletion-request form. | `DataDeletion.tsx:20-43` submits a request RPC; it does **not** immediately delete data. `/admin/deletion-requests` reviews status/notes. |

The repository also contains `src/pages/Inventory.tsx`, `SuperAdmin.tsx`, legacy admin components and other pages not routed by `App.tsx`. Their presence is **not** evidence that users can open them in this version. Conversely, some deployed Edge Functions have no matching local source; see the deployment-parity section below.

### Workspace onboarding and configuration

`Settings.tsx:251-581` edits workspace name, `shipping_enabled`, shipping column visibility, carrier, language and `business_cost_model` (`seller` or `affiliate`) on `workspaces`. Integration cards manage provider connections separately. `useBusinessConfig.ts:19-100` reads/writes default product, delivery, confirmation, fulfillment and lead fees; `useCostRules.ts` manages `workspace_cost_rules` used by modeled profit. Thus Settings changes **future calculations/display**, not the historical financial truth or carrier invoice. The setup checklist reports completion from connection-row presence; it does not verify account permissions, a successful source import or an actual carrier label. The Shipping toggle inconsistency is F27.

### Platform administration and customer support

`AdminPro.tsx:20-45` dispatches admin subroutes. `CommandCenter.tsx:21-63` normally calls `founderAdmin.commandCenter`, billing summary, global orders and seller feed; it subscribes to order changes and debounces refresh. It has hardcoded **development-only preview** data when `import.meta.env.DEV && ?preview=admin`; that mode must never be mistaken for a live platform statistic. The command page's cross-seller numbers are not directly comparable to a seller workspace dashboard. Support tickets are loaded through `founderAdmin.tickets()` and update through `founderAdmin.updateTicket()`; statuses include `open`, `in_progress`, `waiting_on_customer`, `resolved`, `closed`, with low/normal/high/urgent priority (`SupportV3.tsx`). `AdminDataDeletionRequests.tsx` changes request status/notes but is not itself evidence a deletion processor completed. `ErrorCenter.tsx` displays up to 100 recent `ecom_error_events` and lets admins mark resolution state; that is a recorded-error feed, not proof every failure is logged.

## 16. Secondary modules: detailed behavior and limits

### Client Licenses and unauthorized-theme message

The **checked-out design**, not the deployed live capability, is client-centric: `clientLicensing.ts:93-116` calls Edge actions to list/create/update, add/disable/remove domains, disable/archive/revoke/restore/rotate, look up a pasted existing key, and edit per-client/global unauthorized messages. Local migrations `20261007201509_client_license_management.sql` and `20261008000200_client_license_unauthorized_messages.sql` specify a hashed lookup key plus encrypted recoverable original key, child domain/event tables, RLS and plaintext-safe message fields. The intended validator in `theme-domain-licensing/index.ts:341-379` hashes the pasted key, checks active status and hostname, updates last check and returns only a short authorization response plus safe unauthorized copy when denied. The public Vercel proxy `api/theme-license/validate.ts` forwards `action="validate"`.

**Live reality:** the connected database has **only** `theme_domain_licenses` (one active row) and no new client/domain/event/default-message tables. The deployed `theme-domain-licensing` v4 function serves legacy actions `verify/list/create/update/rotate/disable/enable/revoke` against the one-domain table; it has no `validate` or client-message action. Consequently the new UI and public proxy should be considered **not operational** on this project. This is not a recommendation to regenerate the existing key: migration and any recovery must preserve it exactly. The `test:licenses` suite's 9 passing cases validate the checkout, not this deployed parity.

### Live View and real order geography

`useLiveView.ts:15-97` loads snapshots by selected window (`live`, 1m, 5m, 15m, 1h, today), status/source/product/city/campaign/country filters and workspace scope. The hook subscribes to `live_view_events`, deduplicates visible order IDs, requests server geocoding for new unplotted orders and refreshes quietly every minute. The server RPC `get_live_view_snapshot_v1` returns counts, currency-separated revenue, ranked cities/products/sources/campaigns, a capped event list and filter options. `live-view-geolocate` may use a configured geocoding provider and cached address hash; the UI should not expose customer address in a public projection. Project-wide live distribution: **184 city-level plotted / 681 total; 497 unplotted; zero precise coordinates**. This establishes that the current globe is a real-order activity projection with limited geography, not exact customer-point mapping. The 11 isolated Live View contract tests passed; they do not prove a live geocoder returned any address-level match.

### Anti-Fake Orders storefront guard

`AntiFakeOrders.tsx` allows a workspace to register a store hostname, create IP/phone/name/address rules with expiry, enable/disable rules, choose a plain message or a theatrical browser-only block preview, and copy a YouCan script. The public `anti-fake-orders` Edge Function looks up the site key and request hostname, tests IP or supplied customer fields, increments hit count, and returns only block/allow display data. `anti-fake-orders/index.ts:375-418` deliberately **fails open** on script/check errors so a service outage cannot hide a healthy store. The page itself warns that JavaScript can be disabled, so this is not network-level bot protection or a checkout-server guarantee. Live: one registered store, two rules, zero currently enabled, five historic hits. Seven contract tests passed; no external storefront visit was initiated.

### Notifications, browser push and Error Center

`NotificationContext.tsx:45-211` loads a workspace/user bell feed (max 20), unread count via `notification_unread_count`, settings, and a recipient-filtered Realtime channel. It deduplicates incoming IDs, shows localized toast/sound only under settings and quiet-hour rules, and marks read/archive/delete using RPCs. `Notifications.tsx` paginates 30 at a time, filters/searches and uses a safe internal action URL. `notificationService.ts` also registers browser push subscriptions through `notification-subscriptions`; a service worker receives push and routes clicks. Browser permission and an active push device are separate from an in-app notification. Live has 430 notification rows project-wide, 427 unread, but this does not say what any one user sees. Nineteen contract tests passed. F26 documents a potential first-page refetch loop for users with >30 visible rows; that requires an isolated component test before calling it an observed outage. `ErrorCenter` is a separate admin error-event source.

### COD Scenarios and Amine tools

`CodScenarios.tsx:6-105` is a **what-if calculator for 100 hypothetical orders**, independent of Supabase orders. It computes `confirmed=100×confirmationRate`, `delivered=confirmed×deliveryRate`, revenue=`delivered×sellingPrice`, ad cost=`100×adCostPerOrder`, product/delivery/confirmation cost per delivered order, fulfillment and other cost per 100 orders, return cost per undelivered order, then simulated profit, ROI, ROAS, cost per lead/confirmed/delivered and break-even targets. Defaults are input examples, **not production data**. Its `minDelivered` formula undercounts nonzero `otherCostPerOrder` (F25).

`Amine.tsx:18-39` exposes Sawty scripts, landing-page AI, browser WebP compression, a configurable TikTok download provider, MP4→MP3 conversion, remove.bg, QR creation/reading, a second COD calculator, social-comment mockups and a product-test tracker. Most file transforms occur in the browser; the product tracker is `localStorage`-only (`Amine.tsx:152-156`) and therefore not a shared workspace record. The two AI tools call undeployed named Edge Functions (F24). The background-removal tool stores a user-supplied remove.bg API key in browser localStorage and calls that provider directly (`Amine.tsx:125-127`), so it is not a server-held platform secret and can be exposed by a compromised browser/XSS. The TikTok download tool sends entered links to a user-configurable third-party endpoint. Creative mockups are labeled as mockups, not real customer comments.

### Meta launch workflow beyond analytics

`MetaLaunchStudio.tsx:39-52,207-360` builds a hierarchy of campaigns → ad sets → ads with one selected creative per ad. CBO places daily budget on the campaign; ABO sums ad-set daily budgets. The editor checks Page, Pixel, destination, budget, creative, start time and duplicate names before review. Presets save structure and setup, deliberately requiring fresh creative files next time (`MetaLaunchStudio.tsx:363-386`). At submit (`:389-440`), files are sent to Meta through media-upload service, then each campaign is enqueued separately with an idempotency key and `defer_processing=true`. If campaign 1 queues and campaign 2 fails, the first job is not automatically undone; the UI must show per-job outcome. `Launch submitted` is not Meta-approved/live status. No campaign was published during this audit.

### Privacy and deletion

The public `/data-deletion` form invokes `submit_public_data_deletion_request` and returns a reference; it does not immediately erase account/order data (`DataDeletion.tsx:8-45`). An admin can review requests at `/admin/deletion-requests`. Legal account deletion, workspace ownership, retention and actual processing are separate operations and were not executed. Any future deletion processor must respect financial/audit retention and prove completion before a request is marked complete.

### Additional state systems and transition evidence

| Feature | Stored/derived states | Action → validation → write / consequence |
|---|---|---|
| Client License (local design only) | License `active`, `disabled`, `archived`, `revoked`; domain `active`, `disabled`, `removed`. | Admin create generates a permanent key/hash/encrypted value; domain action preserves key; archive/restore preserves row/key; revoke blocks ordinary restore; rotate changes key. Local migration/RPCs and Edge code define these, but **not live** (F22). Legacy live table has one active single-domain row. |
| Unauthorized theme display (local only) | Custom message enabled/disabled; global default fallback. | Admin updates plain text/HTTPS URLs; public validator should return safe copy only for denied state. Not available from deployed legacy function. |
| Anti-Fake | Store/rule enabled boolean, optional expiry, hit counter; output `blocked` true/false. | Admin creates/disables rules; public script checks hostname/site key and IP/customer fields; error → allow (fail-open). No enabled rules live. |
| Live View | Event time window/filter and `geo_source=coordinates/address/city/provider_city/unknown`; `geo_confidence=high/medium/low`. | Order projection/realtime/geocoder update event; unknown stays unplotted. Zero exact-geocoded rows live. |
| Notification | `is_read`, `is_archived`, `expires_at`, priority/category; push-device active flag. | Event creation→recipient row/outbox; client reload/realtime; mark-read/archive/delete RPC; push depends on device permission/preferences. Bell count only unread eligible rows, not all historical notifications. |
| Support ticket | `open`, `in_progress`, `waiting_on_customer`, `resolved`, `closed`; priority low/normal/high/urgent. | Admin protected support update with reply/internal-note option; ticket is not an order status. Runtime delivery of reply not tested. |
| Data-deletion request | `requested`, `under_review`, `approved`, `rejected` are admin-filtered states. | Public RPC records request; admin updates review state. Approval is not proof records were actually erased. |
| Meta bulk job | `queued`, `processing`, `completed`, `partial_failure`, `failed`, `cancelled` (`20260908010528_meta_ads_manager.sql:310-340`). | Studio enqueue creates job; worker/API transitions per item; cancel/retry code exists. **LIVE:** no `meta_bulk_jobs` rows; no successful publication established. |
| Amine product test | Locally computed `Testing`, `Winner`, `Loser` from CPL/CTR thresholds. | Browser localStorage only; not a cross-device or workspace business record. |

## 17. Whole-platform operating sequence in everyday terms

1. **Account and workspace:** a person signs in, joins or owns a workspace; the access resolver and membership/permissions decide which pages and data are available. Subscription billing controls owner access, while invited team members have a separate membership path.
2. **Configure:** the owner sets workspace cost model, shipping visibility, language, provider connections and team roles. The setup checklist summarizes some configuration presence, not proven operational success.
3. **Acquire orders:** manual UI, YouCan, Shopify, Sheets and some messaging paths submit workspace-scoped orders. Each source has its own field/status mapping and retry/dedup key. Failed async jobs can stop the flow before the order appears.
4. **Work orders:** assignment chooses an agent; the agent records calls/activities and sets a confirmation outcome. Team cards, the confirmation summary and payroll can credit/count that work differently.
5. **Ship:** confirmed orders can be sent to a carrier. Provider updates logistics status and tracking independently of confirmation status. Returned parcels need a separate physical-stock event and cash/fee reconciliation, both currently incomplete.
6. **See performance:** Dashboard, Customers, Live View and ads pages project different slices. The globe currently plots only 184 city-level events; campaign cache may be stale; neither visualization verifies cash receipt.
7. **Settle money and payroll:** Finance models revenue and cash-like flow, Expenses models partial profit, and agent invoices record commission liabilities/transfers. These are not one accounting ledger and currently cannot be assumed to reconcile.
8. **Automate and communicate:** WhatsApp, notifications, anti-fake guard and Meta launch jobs operate asynchronously with separate permissions, states and external dependencies. A queued or connected state is not the same as a delivered customer message or a running ad.
9. **Administer the platform:** a platform-permissioned admin can see cross-seller command metrics, resolve support/errors, review subscription payment/deletion requests and manage platform settings. Development preview data is isolated behind `?preview=admin` in DEV; do not quote it as live production.
10. **Audit and recover:** trace a result back to original order/source ID, workspace, status event, provider response, cost record, earning/invoice line and audit log. If any link is missing, state the number or workflow as **estimated, partial or unverified**, not fully settled.

## 18. Platform-wide deployment and verification boundary

The checkout is **not a reliable manifest of what is live**. The connected project reports 70 deployed Edge Functions. Named TikTok and direct Amine AI functions in local source are missing live; the license function is deployed but at an older one-domain implementation; some deployed names such as `shopify-orders-webhook`, `push-notification-worker` and `create-paypal-order` have no identically named source directory in this checkout. Local Live View geocoding/online-assignment/client-license migrations also differ from live migration state. Before any release, compare functions by name **and content/version**, SQL migrations, secrets, auth setting, RLS, frontend URL and public proxy as one unit. A page rendering or static contract test cannot close this gap. Live `meta_bulk_jobs` has zero rows, so successful Launch Studio publication is not established by stored history either.

Read-only second-pass test evidence: `test:notifications` 19/19, `test:licenses` 9/9, `test:live-view` 11/11, added to the earlier 96 for **135 passing local contract tests**. No real billing, publishing, AI generation, carrier webhook, WhatsApp send, license rotation, stock movement or deletion was invoked. The live aggregates in this report are project-wide snapshots, not customer-level exports, and may change after the audit. No typecheck/build or browser end-to-end run was claimed.

**Practical operating rule:** for every Ecom OS feature, ask four separate questions: (1) Is its page routed and permissioned? (2) Is the required backend/schema deployed? (3) Is the workspace connected/configured? (4) Has a real isolated transaction succeeded and been reconciled? Only a verified “yes” to all four supports an operational claim. This report explicitly records “no” or “unverified” where evidence does not reach that bar.



