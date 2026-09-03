# Ecom OS deployment runbook

## 1. Required browser environment (Vercel)

Configure for Preview and Production:

| Variable | Required | Secret | Purpose |
| --- | --- | --- | --- |
| `VITE_APP_URL` | Yes | No | Canonical frontend URL: `https://www.ecomos.ma` |
| `VITE_SUPABASE_URL` | Yes | No | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | No | Publishable key or legacy anon key protected by RLS |
| `VITE_WHATSAPP_WORKER_URL` | Yes for WhatsApp | No | Public HTTPS URL of the VPS `whatsapp-web.js` worker |
| `VITE_YOUCAN_REDIRECT_URI` | Only for YouCan OAuth | No | Browser callback URL: `https://www.ecomos.ma/api/youcan/callback` |

Never configure a service-role key, `sb_secret_...`, OAuth client secret, worker API secret, or private VAPID key with a `VITE_` prefix.

## 2. Supabase Edge Function environment

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions. Feature-specific secrets used by this repository are listed below; configure only the integrations you deploy.

| Feature | Variables |
| --- | --- |
| Allowed web origins | `ALLOWED_FRONTEND_ORIGINS`, `FRONTEND_URL`, `APP_URL` |
| Notifications | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NOTIFICATION_WORKER_SECRET` |
| YouCan | `YOUCAN_CLIENT_ID`, `YOUCAN_CLIENT_SECRET`, `YOUCAN_REDIRECT_URI`, `STATE_SIGNING_SECRET` |
| Google Sheets/OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| Shopify | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `STATE_SIGNING_SECRET` |
| TikTok | `TIKTOK_CRON_SECRET`, `TIKTOK_SCOPES`, `FRONTEND_URL` |
| Coliaty | `COLIATY_API_PUBLIC_KEY`, `COLIATY_API_SECRET_KEY`, `COLIATY_WEBHOOK_TOKEN` |
| Email | `RESEND_API_KEY` |
| Scheduled jobs | `CRON_SECRET`, `CALL_RECORDING_CLEANUP_SECRET` |
| Credential encryption | `ENCRYPTION_KEY`, `TOOLS_API_ENCRYPTION_KEY` |
| Project callbacks | `SUPABASE_PROJECT_REF` |

Example (values intentionally omitted):

```bash
supabase secrets set --env-file supabase/.env.production
```

Do not commit `supabase/.env.production`. Apply database migrations only after a production backup and migration review. The notification and tenant-hardening migrations are additive, but still must be tested against the live schema before `supabase db push`.

## 3. WhatsApp worker on the VPS

The worker uses `whatsapp-web.js`, not Meta's official WhatsApp Cloud API. Each tenant can connect a separate phone number/session; tenant isolation depends on the workspace/session mapping in the worker and database.

Required VPS-only variables:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Backend project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged worker database access; never expose to browsers |
| `WORKER_API_SECRET` | Optional legacy server-to-server credential; browser control uses the user's access token |
| `WORKER_ALLOWED_ORIGINS` | Comma-separated frontend origins allowed to call the worker directly |
| `WORKER_PORT` | HTTP port, defaults to `5000` |
| `SESSION_STORAGE_PATH` | Persistent WhatsApp session directory |
| `WORKER_ID` | Stable worker identifier |
| `QUEUE_POLL_MS` | Optional queue polling interval |

Persist the session directory, run the worker under a process supervisor, place TLS/reverse-proxy protection in front of it, and allow only trusted frontend origins. See `whatsapp-worker/README.md` for commands and endpoints.

## 4. Supabase Auth URLs

In Authentication → URL Configuration:

- Set the production Site URL to the canonical production domain.
- Add the production URL and required callback paths to Redirect URLs.
- Add a Vercel preview wildcard only if preview authentication is required and the risk is acceptable.
- Ensure external provider dashboards use the exact deployed callback URLs.

## 5. Build and deploy

```bash
npm ci
npm run verify
vercel
```

Verify the preview before production:

- `/`, `/login`, `/demo-dashboard`, and `/404` render.
- `/dashboard` redirects unauthenticated users to login.
- Direct navigation and refresh work through the SPA rewrite.
- Static assets, `manifest.webmanifest`, and `sw.js` return successfully.
- There are no unexpected console errors or failed API/CORS requests.
- Authentication, tenant-scoped data, notifications, and WhatsApp QR/control flow work with test accounts.

Promote only a healthy preview:

```bash
vercel --prod
```

## 6. Rollback

- Vercel: promote the previous healthy deployment in the dashboard or run `vercel rollback <deployment-url>`.
- Git: use `git revert <commit>` and push normally; do not force-push shared history.
- Database: use a reviewed forward migration or restore the pre-migration backup.
- WhatsApp worker: restart the previous code release without deleting persistent session storage.

## 7. Credential incident response

If a service-role or secret key enters Git history, removing the line is insufficient. Rotate or replace it in Supabase, update every Edge Function/VPS secret store, redeploy affected services, revoke the old key, and review logs for misuse. Prefer Supabase publishable/secret API keys over legacy long-lived anon/service-role JWT keys where compatibility permits.
