# Ecom OS WhatsApp worker

One isolated `whatsapp-web.js` session per Ecom OS workspace. The frontend now calls this worker directly; the `whatsapp-control` Supabase Edge Function is not required for Connect, Disconnect, status polling, tests, or QR display.

```bash
cp .env.example .env
npm ci
npm test
npm start
```

For local development inside the Ecom OS repository, `npm run dev` also reads `../.env` and accepts `VITE_SUPABASE_URL`. The frontend automatically uses `http://127.0.0.1:5000` when it runs on localhost.

Production requirements:

- expose the worker through HTTPS on the VPS;
- set frontend `VITE_WHATSAPP_WORKER_URL` to that public HTTPS URL;
- set worker `WORKER_ALLOWED_ORIGINS` to the Ecom OS production origin;
- persist and back up `SESSION_STORAGE_PATH`;
- run the worker with a process supervisor;
- keep `SUPABASE_SERVICE_ROLE_KEY` only on the VPS.

Browser requests send the signed-in user's Supabase access token. The worker validates the token, verifies workspace membership and a manager role, then starts the workspace-specific WhatsApp session. `WORKER_API_SECRET` is optional and retained only for legacy server-to-server clients.

Node 24 LTS and a Chromium-compatible runtime are recommended. Never package `.env`, `sessions/`, `.wwebjs_auth/`, `.wwebjs_cache/`, or `node_modules/` into deployment artifacts.

The worker:

- returns the current QR value from `GET /status/:workspaceId` until scanned;
- restores enabled non-disconnected sessions;
- atomically claims one job per workspace to enforce sending intervals;
- checks workspace enablement, connection state, opt-out, expiry, and Moroccan mobile validity before sending;
- processes inbound replies and delivery acknowledgements;
- emits workspace heartbeats for health monitoring.

Control routes are `/connect`, `/disconnect`, `/status/:workspaceId`, and `/test`. `/health` remains public for uptime checks.
