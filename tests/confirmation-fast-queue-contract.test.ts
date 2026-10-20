import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const hook = readFileSync(new URL("../src/hooks/useConfirmationCRM.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/services/confirmationCrmService.ts", import.meta.url), "utf8");

test("confirmation tabs reuse a user and workspace scoped memory snapshot", () => {
  assert.match(hook, /orderCacheKey\(workspaceId, userId, canManage, nextStatus, queue, search, assigneeId, datePreset\)/);
  assert.match(hook, /setOrders\(cached\?\.orders \?\? \[\]\)/);
  assert.match(hook, /setLoading\(!cached\)/);
  assert.match(hook, /setSummary\(cacheValue\(summaryCache, summaryKey\)\?\.summary \?\? null\)/);
  assert.match(hook, /const orderCache = new Map/);
  assert.doesNotMatch(hook, /localStorage|sessionStorage/);
});

test("the first paged order rows render before optional enrichment finishes", () => {
  assert.match(service, /onBaseOrders\?\: \(result: \{ orders: ConfirmationOrder\[\]; total: number \}\) => void/);
  assert.match(service, /onBaseOrders\(\{/);
  assert.match(hook, /setOrders\(base\.orders\)/);
  assert.match(hook, /setLoading\(false\)/);
  assert.match(hook, /const ordersResult = await getConfirmationOrders/);
});

test("summary and agent metrics do not block order rendering", () => {
  assert.match(hook, /const summaryPromise =/);
  assert.match(hook, /void agentsPromise\.then/);
  assert.match(hook, /cacheValue\(metricsCache, summaryKey, 30_000\)/);
  assert.match(hook, /loadRef\.current\(\{ silent: true \}\)/);
  assert.match(hook, /\}, \[workspaceId\]\);/);
});
