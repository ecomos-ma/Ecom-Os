export type ValidationResult = { valid: boolean; errors?: string[] };

export class ValidationService {
  validateParcelInput(input: any): ValidationResult {
    const errors: string[] = [];
    if (!input.parcel_receiver) errors.push("Missing parcel receiver (customer name)");
    if (!input.parcel_phone) errors.push("Missing phone");
    if (!input.parcel_city) errors.push("Missing city mapping / provider city id");
    if (!input.parcel_address) errors.push("Missing address");
    if ((input.parcel_stock === undefined || input.parcel_stock === null) && (!input.products || input.products.length === 0)) {
      errors.push("Products are required when parcel_stock is set or when stock is not provided");
    }
    return { valid: errors.length === 0, errors };
  }
}

export default ValidationService;
