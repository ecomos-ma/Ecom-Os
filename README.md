# Ecom OS

Ecom OS is a multi-tenant operations platform for Moroccan COD sellers. The repository contains the React/Vite web app, Supabase migrations and Edge Functions, and a separate WhatsApp Web worker intended for a private VPS.

## Runtime

- Node.js 24 LTS (`.nvmrc` and `.node-version`)
- npm 10 or newer; the tested package-manager version is declared in `package.json`
- Supabase CLI for local database and Edge Function work

## Local development

```bash
npm ci
copy .env.example .env
npm run dev
```

Set these browser-safe values in `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` — a Supabase publishable key or legacy anon key, never a secret/service-role key
- `VITE_WHATSAPP_WORKER_URL` — public HTTPS URL of the VPS worker; localhost defaults to port 5000
- `VITE_YOUCAN_REDIRECT_URI` — optional, when YouCan OAuth is enabled

The app renders a visible configuration error if the required Supabase browser values are missing or invalid.

## Verification

```bash
npm run typecheck
npm run test:run
npm run build
```

`npm run verify` runs the test suites and the production build. CI performs a clean install and the same verification on Linux.

## Deployment

The web app is configured for Vercel as a Vite SPA. Supabase remains the backend, and the unofficial WhatsApp Web worker remains a separate VPS process; it is not bundled into or hosted by Vercel.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for environment separation, preview/production commands, Supabase redirect URLs, worker setup, verification, and rollback.

## Security rules

- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `sb_secret_...`, OAuth client secrets, VAPID private keys, or worker API secrets through a `VITE_` variable.
- Keep RLS enabled on browser-accessible tables.
- Store Supabase Edge Function secrets with `supabase secrets set` or in the dashboard.
- Store WhatsApp worker secrets only on the VPS.
- Rotate any credential that has ever been committed to Git, even after removing it from the current files.
