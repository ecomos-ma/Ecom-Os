# TikTok Ads integration setup

This integration uses the official TikTok for Business Marketing API v1.3 and Events API 2.0. It does not use browser-held app secrets, mock metrics, or placeholder account data.

## 1. TikTok developer configuration

1. Create a TikTok for Business developer app and request the Marketing API scopes needed to read advertisers, campaigns, ad groups, ads, and reports.
2. Register this exact redirect URL in the TikTok app:

   `https://<project-ref>.supabase.co/functions/v1/tiktok-auth-callback`

3. Complete TikTok app review before production users connect. A connected Business user must have access to at least one advertiser.
4. In Events Manager, create a Web event source and generate an Events API access token. Keep its Event Source ID available for workspace setup.

TikTok references: [Marketing API overview](https://business-api.tiktok.com/portal/docs?id=1738855176671234), [OAuth 2.0](https://business-api.tiktok.com/portal/docs?id=1738373141733378), [Events API 2.0](https://business-api.tiktok.com/portal/docs?id=1771100865818625).

## 2. Apply and deploy

```sh
supabase db push
supabase functions deploy tiktok-auth-start tiktok-auth-callback tiktok-advertisers tiktok-sync tiktok-refresh-token tiktok-events tiktok-disconnect
```

Set backend-only Edge Function secrets. Never prefix these with `VITE_` and never add them to frontend source:

```sh
supabase secrets set \
  TIKTOK_APP_ID="..." \
  TIKTOK_APP_SECRET="..." \
  TIKTOK_REDIRECT_URI="https://<project-ref>.supabase.co/functions/v1/tiktok-auth-callback" \
  TIKTOK_TOKEN_ENCRYPTION_KEY="<64-hex-character-key>" \
  TIKTOK_CRON_SECRET="<independent-random-secret>" \
  TIKTOK_SCOPES="<approved-scope-list>" \
  FRONTEND_URL="https://<ecom-os-origin>"
```

The database stores access and Events tokens only as AES-256-GCM ciphertext. OAuth state is random, hashed, expires after 10 minutes, and can be consumed once.

## 3. Scheduled sync

Create these Supabase Vault secrets: `project_url`, `publishable_key`, and `tiktok_cron_secret`. `tiktok_cron_secret` must match the Edge secret above. Then invoke the installer with a service-role database session:

```sql
select private.install_tiktok_cron_jobs();
```

This installs a 20-minute recent-data sync, a nightly 14-day repair sync for late TikTok reporting, and a five-minute Events API delivery job. Supabase scheduling reference: [Schedule Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).

## 4. Workspace connection

Open Settings → Integrations → TikTok Ads, select **Connect**, authorize TikTok, and choose one or more advertiser accounts. The initial seven-day sync starts immediately. Configure the workspace revenue currency separately from the TikTok advertiser currency; cross-currency profit and Real ROAS remain hidden unless the currencies match because Ecom OS does not invent exchange rates.

For Events API, save the Event Source ID and write-only access token. Add a TikTok Test Event Code only while validating, save it, and select **Test connection**. Test codes are never added to production events.

## 5. Attribution and COD events

Order imports preserve `ttclid`, UTMs, landing/referrer URLs, and exact TikTok campaign/ad group/ad IDs when the source provides them. Attribution priority is: captured `ttclid`, explicit TikTok IDs, unique exact campaign ID/name UTM match, then TikTok source-only. Ambiguous matches are never silently assigned.

Enabled workspaces queue:

- `PlaceAnOrder` for a new, valid TikTok-attributed COD order.
- `CompletePayment` only when that order first reaches delivered status and `cod_payment_collected` is true.

Cancelled, refused, returned, fake, duplicate, blacklisted, and coming-back orders do not qualify. Every event has a deterministic workspace/order/event identity that is hashed into a stable `event_id`, and the database unique constraint prevents duplicate queue rows.

## 6. Expected delays and troubleshooting

- TikTok reporting is not guaranteed real-time; scheduled overlap repairs late-arriving rows by idempotent upsert.
- `Configuration required`: one or more backend secrets are missing.
- `Reconnect required`: the Marketing API token expired or TikTok revoked/changed permissions. Long-term Marketing API tokens do not expose a universal refresh flow; Ecom OS refreshes only when TikTok actually supplied a compatible refresh token and otherwise asks for reconnection.
- No advertisers returned: authorize a Business user who has advertiser access, and confirm app scopes/review.
- Events rejected: confirm Event Source ID, Events access token, workspace currency, Test Event Code (test only), and hashed customer identifiers.
- Run `npm run test:tiktok` for formula and security-contract tests. Run `supabase test db` against a migrated local stack for pgTAP schema/RLS assertions.
