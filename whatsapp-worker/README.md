# Ecom OS WhatsApp Worker V3

The worker is a Chromium-free, multi-workspace WhatsApp Web transport built on the pinned Baileys socket provider. The existing Ecom OS Supabase queue, automation rules, private `whatsapp-audio` bucket, inbound RPC, receipts, and UI remain the system of record.

## Local development

Create `whatsapp-worker/.env`:

```dotenv
WORKER_MODE=development
WORKER_HOST=127.0.0.1
WORKER_PORT=5000
SESSION_STORAGE_PATH=./sessions
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
WORKER_API_SECRET=a-long-random-secret
WORKER_ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
```

Then run:

```bash
cd whatsapp-worker
npm ci
npm run dev
```

In the repository root, set `WHATSAPP_WORKER_API_SECRET` to the same value and run `npm run dev`. Vite proxies `/api/whatsapp-worker/*` to `http://127.0.0.1:5000` and adds the bearer secret on the server side. The browser never receives the secret, and local development needs no Cloudflare tunnel or public URL.

`WORKER_MODE` is mandatory. Development mode refuses non-loopback binding. Production mode refuses to start without `WORKER_API_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.

If Supabase credentials are absent, connection and QR smoke tests remain available, but the queue, audio, inbound replies, receipt persistence, and heartbeat automation are deliberately disabled and `/health` reports `automationEnabled: false`.

## Session and restart behavior

Each workspace has exactly one auth directory:

```text
SESSION_STORAGE_PATH/<workspace UUID>/
```

At startup in full Supabase mode, the worker safely reconnects enabled workspaces that have persisted Baileys credentials. Enabled workspaces without credentials are reported as disconnected and require a new QR. Logout or disconnect with `revoke_session=true` removes only that workspace directory; a non-revoking shutdown keeps it for restart recovery.

## API

Canonical routes:

- `GET /health`
- `POST /sessions/:workspaceId/connect` (returns `202` immediately)
- `GET /sessions/:workspaceId/status`
- `POST /sessions/:workspaceId/disconnect`
- `POST /sessions/:workspaceId/reconnect`
- `POST /sessions/:workspaceId/logout`
- `POST /sessions/:workspaceId/send`

Legacy aliases use the same handlers: `POST /connect`, `POST /disconnect`, `GET /status/:workspaceId`, and `POST /test`.

## Automation behavior

The worker claims jobs only through `claim_whatsapp_jobs`, downloads workspace-owned recordings from the private `whatsapp-audio` bucket, sends voice media with Baileys `ptt: true`, passes inbound messages and quoted provider IDs to `process_whatsapp_inbound`, and persists sent/delivered/read/failed receipts to both message and queue records.

Each queue part is marked before provider transmission and recorded after success. A crash in that interval is classified `DELIVERY_UNKNOWN` and is not automatically resent. Completed text/audio parts are stored in queue payload progress so a safe retry never repeats an already-persisted part.

## Verification

```bash
npm test
```

The suite exercises HTTP health/CORS/routes, non-blocking and duplicate connect, fake-provider state transitions, send/disconnect, phone normalization, queue failure handling, audio fallback, and the uncertain-send boundary.

## Production

Run the worker on Node 22 or 24 behind a private HTTPS endpoint or private network. Configure the `whatsapp-control` Edge Function with `WHATSAPP_WORKER_URL` and the matching bearer secret, persist and back up `SESSION_STORAGE_PATH`, and use a single worker owner for a given workspace session directory.

Baileys is an unofficial WhatsApp Web implementation. Use it only for consent-based, transactional messaging and keep Ecom OS rate limits enabled.
