import test from "node:test";
import assert from "node:assert/strict";
import { renderTemplate, templateVariables } from "../src/automation/templates.js";

test("renders supported order variables and removes unknown values", () => {
  const variables = templateVariables({
    "Order ID": "order-1",
    customer_name: "Amine",
    total: 349,
    items: [{ name: "Abaya", quantity: 2 }],
  }, { name: "Boutique" }, new Date("2026-08-25T12:00:00Z"));
  assert.equal(renderTemplate("Salam {{ customer_name }} — {{total}} DH\n{{products}}", variables), "Salam Amine — 349 DH\n• Abaya × 2");
  assert.equal(renderTemplate("X{{unknown}}Y", variables), "XY");
});
