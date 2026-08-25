/**
 * ShippingEngine.ts
 *
 * The central orchestrator for all shipping operations in EcomOS.
 * Orders NEVER communicate directly with any shipping provider.
 * All traffic flows: Orders → ShippingEngine → ProviderManager → Adapter → External API
 *
 * To add a new provider, register a new adapter via `providerManager.registerProvider()`.
 * No changes required inside the Orders module.
 */
import { providerManager } from "./ProviderManager";

export class ShippingEngine {
    /**
     * Create a shipment for an order.
     * The providerId determines which adapter handles the request.
     */
    async createShipment(providerId: string, orderData: { orderId: string }) {
        const provider = providerManager.getProvider(providerId);
        return provider.createShipment(orderData);
    }

    /**
     * Sync tracking for a list of tracking numbers via the given provider.
     */
    async syncTracking(providerId: string, trackingNumbers: string[]) {
        const provider = providerManager.getProvider(providerId);
        return provider.syncTracking(trackingNumbers);
    }

    /**
     * List all registered shipping providers.
     */
    listProviders(): string[] {
        return providerManager.listProviders();
    }
}

export const shippingEngine = new ShippingEngine();
