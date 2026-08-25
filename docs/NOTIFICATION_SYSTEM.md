# Ecom OS notification system

## Architecture

Ecom OS notifications are persistent backend records, not browser-only UI state.

1. Database triggers or trusted Edge Functions call `emit_notification_event_service`.
2. The private event service validates the workspace, active membership, role, section access, user settings, event overrides, quiet hours, deduplication, and per-user flood limits.
3. It writes a recipient-specific `notifications` record and, when push is enabled, an idempotent `notification_outbox` job.
4. `pg_cron` calls a credential-free `private.dispatch_notification_push()` command every minute. That function reads the worker URL and secret from Supabase Vault and invokes `notification-push` through `pg_net`.
5. The push worker claims jobs with row locks, delivers standards-based Web Push, records receipts, retries temporary errors with exponential backoff, and disables invalid subscriptions.
6. The authenticated app reads only the signed-in user's rows through RLS and receives inserts/updates through Supabase Realtime. The same custom Workbox service worker preserves caching/offline behavior and handles background push.

Raw endpoints and subscription keys are service-role-only. The browser can list sanitized device metadata through `notification_list_devices` and the authenticated subscription Edge Function.

## Database objects and retention

The migration creates:

- `notification_event_catalog`
- `notification_user_settings`
- `notification_preferences`
- `notification_thresholds`
- `notifications`
- `push_subscriptions`
- `notification_outbox`
- `notification_deliveries`

RLS is enabled on all tables. Browser roles cannot insert notifications, read push credentials, read outbox jobs, or execute the trusted emitter. Notification mutations use recipient-constrained RPCs. Old/expired notifications and processed outbox jobs are cleaned by the worker: archived notifications are retained for 90 days, other notifications expire after 180 days, and completed outbox jobs are retained for 30 days.

Repeated entity/failure events use deterministic keys plus registry cooldown windows. Source events include their stable source identifier. Normal events are capped at 60 new recipient records per five minutes; critical events are exempt. Outbox claims are locked and idempotent, have a maximum attempt count, and use exponential retry delays only for temporary failures.

## Required secrets

Generate VAPID keys once:

```bash
npx web-push generate-vapid-keys --json
```

Set Edge Function secrets (use real values, never commit them):

```bash
npx supabase secrets set \
  VAPID_PUBLIC_KEY="..." \
  VAPID_PRIVATE_KEY="..." \
  VAPID_SUBJECT="mailto:operations@example.com" \
  NOTIFICATION_WORKER_SECRET="a-long-random-value" \
  ALLOWED_FRONTEND_ORIGINS="https://ecomscale.vercel.app,http://localhost:8080"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase Edge Functions. `VAPID_PRIVATE_KEY`, the service-role key, and the worker secret must never use a `VITE_` prefix.

Create Vault values used by the scheduler. The worker secret must exactly match the Edge Function secret:

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
select vault.create_secret('THE_SAME_LONG_RANDOM_VALUE', 'notification_worker_secret');
```

If a secret already exists, update it from Supabase Dashboard → Vault rather than creating a duplicate name. Confirm the job after migration:

```sql
select jobname, schedule, active from cron.job where jobname = 'notification-push-dispatch';
```

## Deploy

Apply schema and deploy both functions from the linked production project:

```bash
npx supabase db push
npx supabase functions deploy notification-subscriptions --no-verify-jwt
npx supabase functions deploy notification-push --no-verify-jwt
npm run build
```

JWT verification is intentionally performed inside `notification-subscriptions`, because it also needs correct CORS behavior. `notification-push` requires a constant-time worker-secret check. Neither endpoint accepts an anonymous privileged action.

Deploy the Vite `dist` directory normally. VitePWA injects the build manifest into `src/sw.ts` and emits the single `/sw.js` registered by `src/registerServiceWorker.ts`. Do not add another worker registration.

## Preferences and recipient resolution

Settings are scoped by `(workspace_id, user_id)`, and event overrides by `(workspace_id, user_id, event_key)`. Missing overrides inherit recommended registry defaults. Workspace switching tears down the old Realtime channel and loads the new workspace settings/count.

Recipients come only from active `profile_workspaces` memberships with active profiles and workspaces. Owners/managers receive only registry-approved business-wide events. Assignment events target the assigned agent directly. Agents do not receive `order.created` globally. Required module access is checked for non-manager roles. Removed/suspended members are excluded immediately.

Quiet hours are evaluated in the user's configured IANA timezone. In-app records remain available; normal push is delayed until quiet hours end. Only registry-approved critical events may bypass quiet hours when the user allows it.

Private preview is recommended and enabled by default. Push payloads remove customer phone/address, private notes, credentials, tokens, OTPs, and full financial detail. Notification text is stripped of HTML and action URLs must be same-origin paths.

## Add an event

1. Add a typed definition to `src/notifications/registry.ts` with category, channels, defaults, roles, navigation, dedupe/cooldown, quiet-hour bypass, sound, and preview rules.
2. Add the matching catalog row to a new migration. SQL is the backend enforcement copy of the typed registry.
3. Emit it only from a trusted database trigger or service-role Edge Function through `emit_notification_event_service`; never insert a browser-created notification.
4. Use a deterministic source ID and entity/dedupe key.
5. Add recipient, preference, dedupe, privacy, and navigation tests.

## Test and manual verification

Automated checks:

```bash
npm run test:notifications
npx supabase test db
npm run build
```

The SQL suite checks RLS, grants, recipient-only policies, trusted RPC access, unique dedupe constraints, and cross-workspace membership denial. The Node suite checks channel resolution, mute/quiet hours, timezone and critical override, payload privacy, internal navigation, and the service-worker push/click/offline contract.

For end-to-end testing: enable push from Settings → Notifications, accept the browser prompt, send a test notification, close the tab, and confirm the push opens `/notifications`. Then test an assigned order, a disabled event override, quiet hours, workspace switching, member removal, subscription disable/removal, and an expired endpoint. Inspect `notification_outbox` and `notification_deliveries` with a trusted admin connection when diagnosing delivery.

## Browser and operating-system limitations

- Push requires HTTPS, browser permission, operating-system notification permission, an active subscription, and a reachable push service.
- Chrome, Edge, Firefox, and supported Safari versions differ in presentation and delivery timing.
- iPhone/iPad Web Push requires a supported iOS/iPadOS version and an installed Home Screen web app; a normal Safari tab may not qualify.
- Battery saver, Focus/Do Not Disturb, background restrictions, enterprise policy, or vendor push outages can delay or hide alerts.
- Custom Web Push sounds are controlled by the browser/OS. Ecom OS sound applies only while the app is open and after user interaction.
- A successful push-provider response means accepted for delivery, not proof that the OS displayed it.
