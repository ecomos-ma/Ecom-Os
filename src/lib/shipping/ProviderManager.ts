import { ShippingProvider } from "./types";

export class ProviderManager {
    private providers: Map<string, ShippingProvider> = new Map();

    registerProvider(provider: ShippingProvider) {
        this.providers.set(provider.id, provider);
    }

    getProvider(id: string): ShippingProvider {
        const provider = this.providers.get(id);
        if (!provider) {
            throw new Error(
                `Shipping provider "${id}" is not registered. Available: ${this.listProviders().join(", ") || "none"}.`
            );
        }
        return provider;
    }

    listProviders(): string[] {
        return Array.from(this.providers.keys());
    }
}

export const providerManager = new ProviderManager();
