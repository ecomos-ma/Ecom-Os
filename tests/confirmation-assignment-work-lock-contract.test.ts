import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migrationPath = "supabase/migrations/20261019025000_confirmation_assignment_modes_and_work_leases.sql";
const instantHandoffMigrationPath = "supabase/migrations/20261019202543_instant_confirmation_handoff.sql";

test("confirmation distribution has distinct manual, equal, and smart strategies", () => {
  const migration = read(migrationPath);
  const service = read("src/services/agentPayrollService.ts");
  const team = read("src/pages/Team.tsx");

  assert.match(migration, /distribution_mode text not null default 'automatic_equal'/);
  assert.match(migration, /distribution_mode in \('manual', 'automatic_equal', 'automatic_smart'\)/);
  assert.match(migration, /smart_batch_size integer not null default 3/);
  assert.match(migration, /set_confirmation_distribution_settings_v1/);
  assert.match(migration, /run_confirmation_distribution_v1/);
  assert.match(migration, /fill_smart_confirmation_batches_internal_v1/);
  assert.match(migration, /v_distribution_mode = 'manual' then[\s\S]*return new/);
  assert.match(service, /ConfirmationDistributionMode = "manual" \| "automatic_equal" \| "automatic_smart"/);
  assert.match(team, /Human assignment strategy/);
  assert.match(team, /Automatic Equal/);
  assert.match(team, /Automatic Smart/);
  assert.match(team, /Orders per active batch/);
});

test("automatic assignment excludes owners and requires fresh online presence", () => {
  const migration = read(migrationPath);

  assert.match(migration, /not coalesce\(membership\.is_owner, false\)/);
  assert.match(migration, /workspace_subscription_owners/);
  assert.match(migration, /presence\.status = 'online'/);
  assert.match(migration, /presence\.last_heartbeat >= now\(\) - make_interval/);
  assert.match(migration, /confirmation_agent_is_eligible_v1/);
  assert.match(migration, /confirmation-distribution:/);
  assert.match(migration, /for update of order_row skip locked/);
});

test("smart refill cannot move manual, touched, callback, or actively leased work", () => {
  const migration = read(migrationPath);

  assert.match(migration, /latest\.notes in \('smart_auto', 'smart_refill'\)/);
  assert.doesNotMatch(
    migration.match(/create or replace function public\.refill_smart_confirmation_queue_v1[\s\S]*?\$\$;/)?.[0] ?? "",
    /latest\.notes in \([^)]*manual/,
  );
  assert.match(migration, /not exists \([\s\S]*public\.confirmation_activities activity/);
  assert.match(migration, /callback\.status = 'scheduled'/);
  assert.match(migration, /public\.confirmation_work_leases lease/);
  assert.match(migration, /lease\.expires_at > now\(\)/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\([\s\S]*confirmation-smart-refill:/);
});

test("active work uses expiring exclusive leases with audited takeover", () => {
  const migration = read(migrationPath);
  const page = read("src/pages/Confirmation.tsx");
  const drawer = read("src/pages/confirmation/ConfirmationOrderDrawer.tsx");

  assert.match(migration, /create table if not exists public\.confirmation_work_leases/);
  assert.match(migration, /confirmation_work_leases_one_current_order_idx[\s\S]*where released_at is null/);
  assert.match(migration, /work_lease_seconds integer not null default 180/);
  assert.match(migration, /acquire_confirmation_work_v1/);
  assert.match(migration, /renew_confirmation_work_v1/);
  assert.match(migration, /release_confirmation_work_v1/);
  assert.match(migration, /ORDER_LOCKED_BY_ANOTHER_AGENT/);
  assert.match(migration, /char_length\(btrim\(coalesce\(p_takeover_reason, ''\)\)\) < 4/);
  assert.match(migration, /'LEASE_TAKEN_OVER'/);
  assert.match(page, /setInterval\(renew, 45_000\)/);
  assert.match(page, /Takeover recorded|takeover recorded/i);
  assert.match(drawer, /Take over with reason/);
});

test("Save and Next is lease and version checked before server-side next claim", () => {
  const migration = read(migrationPath);
  const service = read("src/services/confirmationCrmService.ts");
  const drawer = read("src/pages/confirmation/ConfirmationOrderDrawer.tsx");

  assert.match(migration, /save_confirmation_order_with_lease_v1/);
  assert.match(migration, /p_expected_updated_at timestamptz/);
  assert.match(migration, /STALE_ORDER_VERSION/);
  assert.match(migration, /VALID_WORK_LEASE_REQUIRED/);
  assert.match(migration, /p_claim_next/);
  assert.match(migration, /for update of next_order skip locked/);
  assert.match(migration, /public\.acquire_confirmation_work_v1\(p_workspace_id, v_next_order_id/);
  assert.match(migration, /revoke all on function public\.save_confirmation_order_v1[\s\S]*authenticated/);
  assert.match(service, /save_confirmation_order_with_lease_v1/);
  assert.match(service, /p_expected_updated_at/);
  assert.match(service, /p_expected_updated_at: options\.lease\.orderUpdatedAt/);
  assert.doesNotMatch(service, /p_expected_updated_at: options\.lease\.orderUpdatedAt \?\? order\.updatedAt/);
  assert.match(drawer, /same database transaction/);
  assert.doesNotMatch(drawer, /onSaveAndNext/);
});

test("Save and Next uses the visible queue order and never blocks on refresh work", () => {
  const migration = read(instantHandoffMigrationPath);
  const page = read("src/pages/Confirmation.tsx");
  const drawer = read("src/pages/confirmation/ConfirmationOrderDrawer.tsx");
  const service = read("src/services/confirmationCrmService.ts");
  const worker = read("src/sw.ts");
  const registration = read("src/registerServiceWorker.ts");
  const proxy = read("vite.config.ts");
  const productionEndpoint = read("api/confirmation/save.ts");

  assert.match(migration, /orders_confirmation_handoff_agent_idx/);
  assert.match(migration, /next_order\.created_at desc/);
  assert.match(page, /anticipatedNext/);
  assert.match(page, /setSelectedOrder\(target\)/);
  assert.doesNotMatch(page, /anticipatedMatches \? 0 : 180/);
  assert.match(drawer, /Full queue\/detail refreshes are background work/);
  assert.doesNotMatch(drawer, /opacity-35/);
  assert.match(service, /"\/api\/confirmation\/save-items" : "\/api\/confirmation\/save"/);
  assert.match(proxy, /'\/api\/confirmation\/save'/);
  assert.match(productionEndpoint, /save_confirmation_order_with_lease_v1/);
  assert.match(productionEndpoint, /"Authorization": authorization/);
  assert.doesNotMatch(productionEndpoint, /SERVICE_ROLE|service_role/i);
  assert.doesNotMatch(worker, /registerRoute\(\(\{ url \}\) => \/\\\.supabase/);
  assert.match(registration, /removeDevelopmentServiceWorkers/);
});

