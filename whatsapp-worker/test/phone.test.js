import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMoroccanPhone, toRemoteJid } from "../src/utils/phone.js";

test("normalizes common Moroccan mobile formats", () => {
  for (const value of ["0612345678", "+212 6 12 34 56 78", "00212612345678", "612345678"]) {
    assert.equal(normalizeMoroccanPhone(value), "212612345678");
  }
  assert.equal(toRemoteJid("07 12 34 56 78"), "212712345678@c.us");
});

test("rejects landlines, malformed and foreign numbers", () => {
  for (const value of ["0512345678", "06123", "+33612345678", "", null]) {
    assert.equal(normalizeMoroccanPhone(value), null);
  }
});

