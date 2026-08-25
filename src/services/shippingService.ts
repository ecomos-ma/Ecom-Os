import { shippingEngine } from "../lib/shipping/ShippingEngine";

export async function createShipment(providerId: string, orderId: string) {
  return shippingEngine.createShipment(providerId, { orderId });
}

export async function syncTracking(providerId: string, trackingNumbers: string[]) {
  return shippingEngine.syncTracking(providerId, trackingNumbers);
}

export async function listShippingProviders() {
  return shippingEngine.listProviders();
}

export async function createDeliveryNote(orderIds: string[], trackingNumbers: string[]) {
  return {
    success: false,
    message: "Delivery note generation is not supported yet.",
  };
}
