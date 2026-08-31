import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("WhatsApp Worker V3 behavioral suite passes", () => {
  const result = spawnSync(process.execPath, ["--test"], {
    cwd: "whatsapp-worker",
    encoding: "utf8",
    env: { ...process.env, WORKER_MODE: "test" },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
