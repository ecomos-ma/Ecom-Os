import assert from "node:assert/strict";
import test from "node:test";

import { isShippingModuleEnabled } from "../src/lib/shippingModule.ts";
import type { Workspace } from "../src/lib/types.ts";

const workspace = (shipping_enabled?: boolean): Workspace => ({
  id: "workspace-1",
  name: "Test workspace",
  created_at: "2026-01-01T00:00:00.000Z",
  language: "en",
  ...(shipping_enabled === undefined ? {} : { shipping_enabled }),
});

test("Shipping stays enabled for workspaces created before the feature flag existed", () => {
  assert.equal(isShippingModuleEnabled(workspace()), true);
});

test("Shipping respects an explicit enabled or disabled workspace setting", () => {
  assert.equal(isShippingModuleEnabled(workspace(true)), true);
  assert.equal(isShippingModuleEnabled(workspace(false)), false);
});

test("Shipping remains blocked until a workspace is loaded", () => {
  assert.equal(isShippingModuleEnabled(null), false);
  assert.equal(isShippingModuleEnabled(undefined), false);
});
