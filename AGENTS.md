# Ecom OS WhatsApp Local Development

## Local Development Architecture

Browser: `http://localhost:8080` → Vite dev server proxy → `http://127.0.0.1:5000` (WhatsApp Worker)

NO Cloudflare, NO tunnels, NO public URLs required for local development.

## Setup Steps

1. **Configure WhatsApp Worker:**
   ```bash
   cd whatsapp-worker
   cp .env.example .env
   # Edit .env and set WORKER_API_SECRET to a secure value
   npm ci
   npm run dev  # Runs on http://127.0.0.1:5000
   ```

2. **Configure Frontend:**
   ```bash
   # In root directory
   cp .env.example .env
   # Edit .env and set WHATSAPP_WORKER_API_SECRET to the SAME value as WORKER_API_SECRET
   # DO NOT prefix with VITE_ - this must remain server-side only
   npm run dev  # Runs on http://localhost:8080
   ```

3. **Environment Variables:**
   - `whatsapp-worker/.env`: `WORKER_API_SECRET=your_secret`
   - Root `.env`: `WHATSAPP_WORKER_API_SECRET=your_secret` (must match)

## Verification

1. Open `http://localhost:8080/settings`
2. Navigate to WhatsApp Automation
3. Expected:
   - Worker health: Healthy
   - Connection: Disconnected
4. Click "Connect WhatsApp"
5. Expected worker logs:
   - `connect requested`
   - `state initializing`
   - `client created`
   - `initialize start`
6. Expected UI:
   - Connection state: QR required
   - QR code displayed in modal
7. Scan QR with WhatsApp
8. Expected sequence:
   - `qr` → `authenticated` → `ready`
   - UI shows: Connected
9. Refresh browser - should still show Connected

## Key Implementation Details

- **Vite Proxy:** `/api/whatsapp-worker/*` → `http://127.0.0.1:5000` with Bearer auth
- **Service Layer:** `whatsappWorkerService.ts` uses local API in DEV, Edge Function in production
- **Auth:** Local development bypasses Supabase auth for worker control
- **QR Code:** Displayed using existing `react-qr-code` library
- **Polling:** 1.5s during connection states, 5s otherwise
- **State Machine:** disconnected → initializing → qr_required → authenticated → ready

## Troubleshooting

- If worker doesn't start: Check `WORKER_API_SECRET` is set in `whatsapp-worker/.env`
- If proxy fails: Check `WHATSAPP_WORKER_API_SECRET` matches in root `.env`
- If QR doesn't appear: Check worker logs for `qr received` event
- If connection fails: Check worker logs for initialization errors

## Production Architecture

Production uses a different architecture with Supabase Edge Functions (`whatsapp-control`) as an intermediary. The local development setup bypasses this for simplicity and speed.
