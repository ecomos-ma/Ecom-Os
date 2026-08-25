import test from "node:test";
import assert from "node:assert/strict";
import { dateRangeForPreset, hasCurrencyMismatch, percent, safeDivide, stableEventId } from "../src/lib/tiktokMetrics.ts";

test("safe divisions never invent a zero-denominator metric", () => {
  assert.equal(safeDivide(20, 4), 5);
  assert.equal(safeDivide(20, 0), null);
  assert.equal(percent(25, 100), 25);
  assert.equal(percent(1, 0), null);
});

test("date presets are inclusive and account-timezone aware", () => {
  const now = new Date("2026-08-25T00:30:00Z");
  assert.deepEqual(dateRangeForPreset("today", "America/Los_Angeles", now), { start: "2026-08-24", end: "2026-08-24" });
  assert.deepEqual(dateRangeForPreset("last7", "UTC", now), { start: "2026-08-19", end: "2026-08-25" });
});

test("currency mismatch is explicit and absent currencies are not guessed", () => {
  assert.equal(hasCurrencyMismatch("MAD", "USD"), true);
  assert.equal(hasCurrencyMismatch("mad", "MAD"), false);
  assert.equal(hasCurrencyMismatch(null, "USD"), false);
});

test("event identity is stable per workspace, order and event", () => {
  assert.equal(stableEventId("w1", "o1", "PlaceAnOrder"), stableEventId("w1", "o1", "PlaceAnOrder"));
  assert.notEqual(stableEventId("w1", "o1", "PlaceAnOrder"), stableEventId("w1", "o1", "CompletePayment"));
});
