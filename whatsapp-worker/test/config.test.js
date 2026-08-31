import assert from "node:assert/strict";
import test from "node:test";
import { createWorkerConfig } from "../src/config/env.js";

test("worker mode is explicit and production fails closed", () => {
  assert.throws(() => createWorkerConfig({}, process.cwd()), /WORKER_MODE/);
  assert.throws(() => createWorkerConfig({ WORKER_MODE: "production" }, process.cwd()), /WORKER_API_SECRET/);
});

test("development is loopback-only and wildcard CORS is rejected", () => {
  assert.throws(() => createWorkerConfig({ WORKER_MODE: "development", WORKER_HOST: "0.0.0.0" }, process.cwd()), /loopback/);
  assert.throws(() => createWorkerConfig({ WORKER_MODE: "test", WORKER_ALLOWED_ORIGINS: "*" }, process.cwd()), /cannot contain/);
  const config = createWorkerConfig({ WORKER_MODE: "development" }, process.cwd());
  assert.equal(config.host, "127.0.0.1");
  assert.ok(config.allowedOrigins.includes("http://localhost:8080"));
});
