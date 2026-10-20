import test from "node:test";
import assert from "node:assert/strict";
import { calculateTeamOrderRates } from "../src/lib/teamConfirmationMetrics.ts";

test("pending orders never inflate delivery rate to 100 percent", () => {
  const orders = [
    ...Array.from({ length: 146 }, () => ({ status: "pending", shipping: "NEW" })),
    ...Array.from({ length: 3 }, () => ({ status: "confirmed", shipping: "NEW" })),
    { status: "pending", shipping: "DELIVERED" },
  ];
  const result = calculateTeamOrderRates(orders);
  assert.equal(result.confirmed, 4);
  assert.equal(result.delivered, 1);
  assert.equal(result.confirmationRate, 4 / 150 * 100);
  assert.equal(result.deliveryRate, 25);
});

test("delivery and confirmation rates have defined empty denominators", () => {
  assert.deepEqual(calculateTeamOrderRates([]), {
    confirmed: 0, delivered: 0, confirmationRate: 0, deliveryRate: 0,
  });
});
