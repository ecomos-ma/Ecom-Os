import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseWhatsAppRepository } from "../src/supabase/repository.js";

class UpdateQuery {
  constructor(result, filters = []) { this.result = result; this.filters = filters; }
  eq() { return this; }
  in(column, values) { this.filters.push({ column, values }); return this; }
  then(resolve, reject) { return Promise.resolve(this.result).then(resolve, reject); }
}

test("heartbeat repairs canonical settings state as well as the heartbeat row", async () => {
  const calls = [];
  const client = {
    rpc(name, args) {
      calls.push({ kind: "rpc", name, args });
      return Promise.resolve({ data: null, error: null });
    },
    from(table) {
      return {
        update(values) {
          calls.push({ kind: "update", table, values });
          return new UpdateQuery({ data: null, error: null });
        },
      };
    },
  };
  const repository = new SupabaseWhatsAppRepository(client);

  await repository.heartbeat({
    workspaceId: "11111111-1111-4111-8111-111111111111",
    workerId: "worker-test",
    workerVersion: "3.0.0",
    status: "ready",
    queueDepth: 2,
    lastError: null,
    metadata: { connection_status: "ready", connected_phone: "212600000000" },
  });

  const settingsUpdate = calls.find((call) => call.kind === "update" && call.table === "whatsapp_settings");
  assert.ok(settingsUpdate);
  assert.equal(settingsUpdate.values.connection_status, "ready");
  assert.equal(settingsUpdate.values.provider, "baileys");
  assert.equal(settingsUpdate.values.connected_phone, "212600000000");
  assert.equal(settingsUpdate.values.worker_version, "3.0.0");
});

test("receipt persistence never regresses delivered or read records", async () => {
  const calls = [];
  const client = {
    from(table) {
      return {
        update(values) {
          const call = { table, values, filters: [] };
          calls.push(call);
          return new UpdateQuery({ data: null, error: null }, call.filters);
        },
      };
    },
  };
  const repository = new SupabaseWhatsAppRepository(client);

  await repository.updateReceipt("11111111-1111-4111-8111-111111111111", "provider-id", "sent");
  assert.equal(calls.length, 2);
  for (const call of calls) {
    const statusFilter = call.filters.find((filter) => filter.column === "status");
    assert.ok(statusFilter);
    assert.ok(statusFilter.values.includes("sent"));
    assert.ok(!statusFilter.values.includes("delivered"));
    assert.ok(!statusFilter.values.includes("read"));
  }
});
