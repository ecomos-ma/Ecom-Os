export type TeamMetricOutcome = { status: string | null; shipping: string };

export function hasConfirmedOutcome(status: string | null, shipping: string) {
  return ["confirmed", "shipped", "delivered"].includes(status ?? "")
    || ["DELIVERED", "COMING_BACK", "OUT_FOR_DELIVERY", "READY"].includes(shipping);
}

export function calculateTeamOrderRates(orders: TeamMetricOutcome[]) {
  let confirmed = 0;
  let delivered = 0;
  for (const order of orders) {
    if (hasConfirmedOutcome(order.status, order.shipping)) confirmed += 1;
    if (order.shipping === "DELIVERED") delivered += 1;
  }
  return {
    confirmed,
    delivered,
    confirmationRate: orders.length ? (confirmed / orders.length) * 100 : 0,
    deliveryRate: confirmed ? (delivered / confirmed) * 100 : 0,
  };
}
