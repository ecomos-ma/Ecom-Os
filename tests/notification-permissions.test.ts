import test from "node:test";
import assert from "node:assert/strict";
import { resolveNotificationPermissionState } from "../src/notifications/permissions.ts";

test("browser permission states are explicit", () => {
  assert.equal(resolveNotificationPermissionState(false, "default", false), "unsupported");
  assert.equal(resolveNotificationPermissionState(true, "default", false), "not_requested");
  assert.equal(resolveNotificationPermissionState(true, "denied", false), "denied");
  assert.equal(resolveNotificationPermissionState(true, "granted", false), "allowed");
  assert.equal(resolveNotificationPermissionState(true, "granted", true), "active");
});
