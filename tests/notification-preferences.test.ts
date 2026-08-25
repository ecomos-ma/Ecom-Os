import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOTIFICATION_EVENTS } from "../src/notifications/registry.ts";
import { resolveEventChannel, shouldDelayForQuietHours } from "../src/notifications/preferences.ts";
import type { NotificationPreference, NotificationUserSettings } from "../src/notifications/types.ts";

const settings: NotificationUserSettings = {
  workspace_id: "00000000-0000-4000-8000-000000000001",
  user_id: "00000000-0000-4000-8000-000000000002",
  notifications_enabled: true,
  in_app_enabled: true,
  push_enabled: true,
  sound_enabled: true,
  muted_until: null,
  quiet_hours_enabled: true,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
  timezone: "UTC",
  quiet_days: [0, 1, 2, 3, 4, 5, 6],
  allow_critical_during_quiet_hours: true,
  private_preview_enabled: true,
};

test("global switch disables every channel", () => {
  const disabled = { ...settings, notifications_enabled: false };
  for (const channel of ["in_app", "push", "sound"] as const) {
    assert.equal(resolveEventChannel(NOTIFICATION_EVENTS["order.created"], undefined, disabled, channel), false);
  }
});

test("event override disables push without disabling in-app", () => {
  const preference: NotificationPreference = { workspace_id: settings.workspace_id, user_id: settings.user_id, event_key: "order.created", in_app_enabled: true, push_enabled: false, sound_enabled: null, delivery_mode: "immediate" };
  assert.equal(resolveEventChannel(NOTIFICATION_EVENTS["order.created"], preference, settings, "in_app"), true);
  assert.equal(resolveEventChannel(NOTIFICATION_EVENTS["order.created"], preference, settings, "push"), false);
});

test("mute suppresses delivery", () => {
  const muted = { ...settings, muted_until: new Date(Date.now() + 60_000).toISOString() };
  assert.equal(resolveEventChannel(NOTIFICATION_EVENTS["order.created"], undefined, muted, "in_app"), false);
});

test("quiet hours are timezone-aware and critical override is registry controlled", () => {
  const duringQuietHours = new Date("2026-08-25T23:30:00.000Z");
  assert.equal(shouldDelayForQuietHours(NOTIFICATION_EVENTS["order.created"], settings, "normal", duringQuietHours), true);
  assert.equal(shouldDelayForQuietHours(NOTIFICATION_EVENTS["inventory.out_of_stock"], settings, "critical", duringQuietHours), false);
});

test("events cannot enable unavailable channels", () => {
  assert.equal(resolveEventChannel(NOTIFICATION_EVENTS["finance.expense_created"], undefined, settings, "sound"), false);
});

test("every typed registry event has complete delivery metadata and a backend catalog row", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260825060018_production_notification_system.sql", import.meta.url), "utf8");
  for (const [key, definition] of Object.entries(NOTIFICATION_EVENTS)) {
    assert.equal(definition.key, key);
    assert.ok(definition.availableChannels.length > 0);
    assert.ok(definition.allowedRecipientRoles.length > 0);
    assert.ok(definition.rateLimitStrategy);
    assert.match(definition.navigationTarget({}), /^\//);
    assert.ok(migration.includes(`('${key}'`), `missing backend catalog row for ${key}`);
  }
});

test("notification migration repairs legacy schemas before creating filtered indexes", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260825060018_production_notification_system.sql", import.meta.url), "utf8");
  const preferencesGuard = migration.indexOf("alter table public.notification_preferences set schema private");
  const preferencesIndex = migration.indexOf("create index if not exists notification_preferences_lookup_idx");
  const legacyGuard = migration.indexOf("alter table public.notifications set schema private");
  const compatibilityColumns = migration.indexOf("add column if not exists is_archived boolean not null default false");
  const subscriptionsGuard = migration.indexOf("alter table public.push_subscriptions set schema private");
  const subscriptionsIndex = migration.indexOf("create index if not exists push_subscriptions_user_active_idx");
  const filteredIndex = migration.indexOf("create index if not exists notifications_recipient_feed_idx");

  assert.ok(preferencesGuard >= 0, "legacy notification preferences must be preserved privately");
  assert.ok(preferencesIndex > preferencesGuard, "preference indexes must follow legacy-table detection");
  assert.ok(legacyGuard >= 0, "legacy notifications table must be preserved privately");
  assert.ok(compatibilityColumns > legacyGuard, "compatibility columns must follow legacy-table detection");
  assert.ok(filteredIndex > compatibilityColumns, "filtered indexes must be created after compatibility columns");
  assert.ok(subscriptionsGuard >= 0, "legacy push subscriptions must be preserved privately");
  assert.ok(subscriptionsIndex > subscriptionsGuard, "subscription indexes must follow legacy-table detection");
});
