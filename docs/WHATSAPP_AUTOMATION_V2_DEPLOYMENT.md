# WhatsApp Automation v2 deployment and verification

This release keeps the existing `whatsapp-web.js` provider but replaces the incompatible database, browser-secret, and inbound contracts. It is intentionally not deployed by the code change.

## Security actions required before deployment

1. Remove `whatsapp-worker.zip` from every shared machine/artifact store. It contains a service-role environment file and a live WhatsApp browser session.
2. Rotate the Supabase service-role key used by the worker.
3. In WhatsApp, remove the linked device represented by the leaked session, then reconnect through Ecom OS.
4. Generate new independent values for `WHATSAPP_WORKER_API_SECRET` and `WHATSAPP_WEBHOOK_SECRET`.
5. Never put either secret in a `VITE_*` variable or browser bundle.

## Deployment order

The local repository has older migration files that are not recorded in the linked project's migration history. Do not run an unreviewed `supabase db push --include-all`. Reconcile the migration history first, then apply only:

`supabase/migrations/20260825031852_whatsapp_automation_v2.sql`

After applying the migration:

1. Run `supabase test db` in an environment with Docker/Postgres. The v2 pgTAP suite is `supabase/tests/whatsapp_automation_v2.test.sql`.
2. Configure Edge Function secrets:

   - `WHATSAPP_WORKER_URL=https://worker.example.com/`
   - `WHATSAPP_WORKER_API_SECRET=<new random secret>`
   - `WHATSAPP_WEBHOOK_SECRET=<different random secret>`
   - `ALLOWED_FRONTEND_ORIGINS=https://app.example.com,http://localhost:5173`

3. Deploy `whatsapp-control` and the updated `whatsapp-webhook`.
4. Deploy the clean `whatsapp-worker/` directory on Node 20+ with a persistent encrypted volume mounted at `SESSION_STORAGE_PATH`.
5. Set the worker's `WORKER_API_SECRET` to the same value as the Edge Function's `WHATSAPP_WORKER_API_SECRET`.
6. Deploy the frontend last.

## Worker runtime

Required environment variables are documented in `whatsapp-worker/.env.example`. The worker needs outbound access to Supabase and WhatsApp Web, plus a Chromium-compatible runtime. Its `/health` endpoint exposes only health/version; every workspace control endpoint requires the worker bearer secret.

Session directories and `.env` are ignored by Git. Back up session volumes only into encrypted, access-controlled infrastructure.

## Signed webhook format

The alternate inbound Edge webhook requires:

- `x-ecom-timestamp`: Unix seconds, no more than five minutes old.
- `x-ecom-signature`: `sha256=<hex HMAC>`.
- HMAC input: `<timestamp>.<raw request body>` using `WHATSAPP_WEBHOOK_SECRET`.

The primary `whatsapp-web.js` worker processes inbound events directly through the same service-only database RPC, so there is one matching/action implementation.

## Manual acceptance test

Use a dedicated test workspace and WhatsApp number.

1. Connection: enable automation, connect, scan QR, confirm `ready`, heartbeat under two minutes, then disconnect and confirm the linked session is revoked.
2. Tenant isolation: as a user from another workspace, verify settings, rules, queue, messages, audio, logs, and signed downloads return no rows/access.
3. Phone formats: create pending orders with `06`, `07`, `+212`, and `00212`; verify exactly one queue row each. Verify a landline, foreign number, and malformed number are skipped with an event log.
4. Idempotency: update an order into the same configured status repeatedly and confirm only one rule/order queue item exists.
5. Schedule: place the workspace in quiet hours; verify `scheduled_for` moves to the allowed window in `Africa/Casablanca`. Verify active-day and expiry behavior.
6. Confirmation: receive the Darija message, reply `1`, and verify the exact workspace/order changes to `confirmed`, `confirmation_method=whatsapp`, and `confirmed_at` is populated.
7. Callback: reply `2`, verify order status `scheduled` and a CRM callback assigned for the configured delay. If no agent exists, verify an open manual-review row.
8. Ambiguity: create two recent confirmations for the same phone and reply without quoting; verify no order changes and a manual-review row is created.
9. Opt-out: reply `STOP`; verify pending items are cancelled, orders are marked opted out, and future triggers do not enqueue.
10. Audio: record and upload audio, select text → audio, send an order, verify both parts are logged. Remove media access and verify fallback text.
11. Retry: stop the provider before a send and verify exponential retry. Stop the worker after provider send begins but before persistence and verify `delivery_unknown` fails closed for manual review instead of duplicating.
12. Receipts/logs: verify sent, delivered, and read timestamps appear in Settings logs and in the order/customer timelines.

## Operational monitoring

- Alert when `whatsapp_worker_heartbeats.seen_at` is older than two minutes for an enabled workspace.
- Alert on `delivery_unknown`, `partial_send`, repeated `provider_disconnected`, and growing pending depth.
- Inspect Supabase `function_edge_logs`/`function_logs` for the control or signed-webhook layer and `postgres_logs` for RPC/RLS failures.
- Keep rate limits conservative. `whatsapp-web.js` is an unofficial provider and cannot guarantee account safety.

