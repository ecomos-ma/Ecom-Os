export interface ShippingProvider {
    id: string;
    name: string;
    createShipment(orderData: any): Promise<any>;
    syncTracking(trackingNumbers: string[]): Promise<any>;
    generateDeliveryNote(orderIds: string[], trackingNumbers: string[]): Promise<any>;
}

export interface ShippingEngineConfig {
    defaultProvider: string;
}
