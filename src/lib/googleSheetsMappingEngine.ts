// ============================================================
// GOOGLE SHEETS SMART MAPPING ENGINE
// ============================================================
// Provides intelligent field mapping suggestions for Google Sheets integration

import { CanonicalStatus, normalizeStatus } from './statusEngine';

// ============================================================
// AVAILABLE ECOM OS ORDER FIELDS FOR MAPPING
// Only user-relevant fields that appear in Orders UI
// ============================================================
export const AVAILABLE_DESTINATION_FIELDS = [
  {
    field: 'customer_name',
    label: 'Customer',
    category: 'customer',
    description: 'Customer full name'
  },
  {
    field: 'phone',
    label: 'Phone',
    category: 'customer',
    description: 'Customer phone number'
  },
  {
    field: 'address',
    label: 'Address',
    category: 'shipping',
    description: 'Full shipping address'
  },
  {
    field: 'city',
    label: 'City',
    category: 'shipping',
    description: 'City name'
  },
  {
    field: 'product_name',
    label: 'Product Name',
    category: 'product',
    description: 'Product name'
  },
  {
    field: 'product_variant',
    label: 'Variant',
    category: 'product',
    description: 'Product variant name'
  },
  {
    field: 'sku',
    label: 'SKU',
    category: 'product',
    description: 'Product SKU code'
  },
  {
    field: 'total',
    label: 'Total',
    category: 'pricing',
    description: 'Order total amount'
  },
  {
    field: 'tracking_number',
    label: 'Tracking',
    category: 'shipping',
    description: 'Shipping tracking number'
  },
  {
    field: 'order_date',
    label: 'Order Date',
    category: 'order',
    description: 'Order date'
  },
  {
    field: 'customer_ip',
    label: 'Customer IP',
    category: 'customer',
    description: 'Customer IP address'
  },
  {
    field: 'notes',
    label: 'Customer Note',
    category: 'notes',
    description: 'Customer notes or comments'
  },
  {
    field: 'status',
    label: 'Confirmation Status',
    category: 'status',
    description: 'Order confirmation status'
  },
  {
    field: 'shipping_status',
    label: 'Shipping Status',
    category: 'status',
    description: 'Shipping/delivery status'
  },
  { field: 'source_platform', label: 'Source Platform', category: 'order', description: 'Traffic source, for example tiktok' },
  { field: 'utm_source', label: 'UTM Source', category: 'order', description: 'utm_source attribution value' },
  { field: 'utm_medium', label: 'UTM Medium', category: 'order', description: 'utm_medium attribution value' },
  { field: 'utm_campaign', label: 'UTM Campaign', category: 'order', description: 'Campaign ID or exact campaign name' },
  { field: 'utm_content', label: 'UTM Content', category: 'order', description: 'utm_content attribution value' },
  { field: 'utm_term', label: 'UTM Term', category: 'order', description: 'utm_term attribution value' },
  { field: 'ttclid', label: 'TikTok Click ID', category: 'order', description: 'TikTok click identifier' },
  { field: 'landing_page', label: 'Landing Page', category: 'order', description: 'Original landing page URL' },
  { field: 'referrer', label: 'Referrer', category: 'order', description: 'Original referrer URL' },
  { field: 'tiktok_campaign_id', label: 'TikTok Campaign ID', category: 'order', description: 'Exact TikTok campaign ID' },
  { field: 'tiktok_adgroup_id', label: 'TikTok Ad Group ID', category: 'order', description: 'Exact TikTok ad group ID' },
  { field: 'tiktok_ad_id', label: 'TikTok Ad ID', category: 'order', description: 'Exact TikTok ad ID' }
];

// ============================================================
// SMART MAPPING ALIASES
// ============================================================
const MAPPING_ALIASES: Record<string, string> = {
  'source platform': 'source_platform',
  'source_platform': 'source_platform',
  'utm source': 'utm_source',
  'utm_source': 'utm_source',
  'utm medium': 'utm_medium',
  'utm_medium': 'utm_medium',
  'utm campaign': 'utm_campaign',
  'utm_campaign': 'utm_campaign',
  'utm content': 'utm_content',
  'utm_content': 'utm_content',
  'utm term': 'utm_term',
  'utm_term': 'utm_term',
  'ttclid': 'ttclid',
  'landing page': 'landing_page',
  'landing_page': 'landing_page',
  'referrer': 'referrer',
  'tiktok campaign id': 'tiktok_campaign_id',
  'tiktok_campaign_id': 'tiktok_campaign_id',
  'tiktok ad group id': 'tiktok_adgroup_id',
  'tiktok_adgroup_id': 'tiktok_adgroup_id',
  'tiktok ad id': 'tiktok_ad_id',
  'tiktok_ad_id': 'tiktok_ad_id',
  // Customer field aliases
  'customer': 'customer_name',
  'Customer': 'customer_name',
  'CLIENT': 'customer_name',
  'Client': 'customer_name',
  'client': 'customer_name',
  'nom': 'customer_name',
  'Nom': 'customer_name',
  'full name': 'customer_name',
  'Full Name': 'customer_name',
  'customer name': 'customer_name',
  'Customer Name': 'customer_name',
  'name': 'customer_name',
  'Name': 'customer_name',
  
  // Phone aliases
  'phone': 'phone',
  'Phone': 'phone',
  'tel': 'phone',
  'Tel': 'phone',
  'téléphone': 'phone',
  'Téléphone': 'phone',
  'telephone': 'phone',
  'numéro': 'phone',
  'Numéro': 'phone',
  'numero': 'phone',
  'customer phone': 'phone',
  'Customer Phone': 'phone',
  'mobile': 'phone',
  'Mobile': 'phone',
  
  // Address aliases
  'address': 'address',
  'Address': 'address',
  'adresse': 'address',
  'Adresse': 'address',
  'shipping address': 'address',
  'Shipping Address': 'address',
  'full address': 'address',
  'Full Address': 'address',
  
  // City aliases
  'city': 'city',
  'City': 'city',
  'ville': 'city',
  'Ville': 'city',
  'customer city': 'city',
  'Customer City': 'city',
  'destination city': 'city',
  'Destination City': 'city',
  
  // Product name aliases
  'product name': 'product_name',
  'Product Name': 'product_name',
  'product': 'product_name',
  'Product': 'product_name',
  'item': 'product_name',
  'Item': 'product_name',
  'product title': 'product_name',
  'Product Title': 'product_name',
  
  // Product variant aliases
  'product variant': 'product_variant',
  'Product Variant': 'product_variant',
  'variant': 'product_variant',
  'Variant': 'product_variant',
  'variation': 'product_variant',
  'Variation': 'product_variant',
  'option': 'product_variant',
  'Option': 'product_variant',
  
  // SKU aliases
  'sku': 'sku',
  'SKU': 'sku',
  'reference': 'sku',
  'Reference': 'sku',
  'ref': 'sku',
  'Ref': 'sku',
  'code': 'sku',
  'Code': 'sku',
  'product code': 'sku',
  'Product Code': 'sku',
  
  // Price/Total aliases
  'price': 'total',
  'Price': 'total',
  'amount': 'total',
  'Amount': 'total',
  'total': 'total',
  'Total': 'total',
  'variant price': 'total',
  'Variant Price': 'total',
  'prix': 'total',
  'Prix': 'total',
  'montant': 'total',
  'Montant': 'total',
  
  // Order date aliases
  'order date': 'order_date',
  'Order Date': 'order_date',
  'date': 'order_date',
  'Date': 'order_date',
  'order_date': 'order_date',
  'date de commande': 'order_date',
  'Date de commande': 'order_date',
  
  // Tracking number aliases
  'tracking number': 'tracking_number',
  'Tracking Number': 'tracking_number',
  'tracking': 'tracking_number',
  'Tracking': 'tracking_number',
  'track': 'tracking_number',
  'Track': 'tracking_number',
  'suivi': 'tracking_number',
  'Suivi': 'tracking_number',
  
  // Customer IP aliases
  'customer ip': 'customer_ip',
  'Customer IP': 'customer_ip',
  'ip': 'customer_ip',
  'IP': 'customer_ip',
  'ip address': 'customer_ip',
  'IP Address': 'customer_ip',
  
  // Notes aliases
  'customer note': 'notes',
  'Customer Note': 'notes',
  'note': 'notes',
  'Note': 'notes',
  'notes': 'notes',
  'Notes': 'notes',
  'comment': 'notes',
  'Comment': 'notes',
  'comments': 'notes',
  'Comments': 'notes',
  'remarque': 'notes',
  'Remarque': 'notes',
  
  // Confirmation status aliases
  'confirmation': 'status',
  'Confirmation': 'status',
  'confirmation status': 'status',
  'Confirmation Status': 'status',
  'status': 'status',
  'Status': 'status',
  'order status': 'status',
  'Order Status': 'status',
  'état': 'status',
  'État': 'status',
  
  // Shipping status aliases
  'delivery': 'shipping_status',
  'Delivery': 'shipping_status',
  'delivery status': 'shipping_status',
  'Delivery Status': 'shipping_status',
  'shipping status': 'shipping_status',
  'Shipping Status': 'shipping_status',
  'shipping': 'shipping_status',
  'Shipping': 'shipping_status',
  'livraison': 'shipping_status',
  'Livraison': 'shipping_status',
  'état livraison': 'shipping_status',
  'État livraison': 'shipping_status',
};

// ============================================================
// SMART MAPPING FUNCTION
// ============================================================
export function suggestDestinationField(sheetHeader: string): string | null {
  if (!sheetHeader) return null;
  
  const normalized = sheetHeader.trim();
  
  // Check exact match in aliases
  if (MAPPING_ALIASES[normalized]) {
    return MAPPING_ALIASES[normalized];
  }
  
  // Check case-insensitive match
  const lowerKey = normalized.toLowerCase();
  for (const [alias, destination] of Object.entries(MAPPING_ALIASES)) {
    if (alias.toLowerCase() === lowerKey) {
      return destination;
    }
  }
  
  // Check partial match for common patterns
  if (lowerKey.includes('customer') && !lowerKey.includes('email') && !lowerKey.includes('phone')) {
    return 'customer_name';
  }
  if (lowerKey.includes('phone') || lowerKey.includes('tel') || lowerKey.includes('mobile')) {
    return 'phone';
  }
  if (lowerKey.includes('address') || lowerKey.includes('adresse')) {
    return 'address';
  }
  if (lowerKey.includes('city') || lowerKey.includes('ville')) {
    return 'city';
  }
  if (lowerKey.includes('sku') || lowerKey.includes('ref') || lowerKey.includes('code')) {
    return 'sku';
  }
  if (lowerKey.includes('variant') || lowerKey.includes('option')) {
    return 'product_variant';
  }
  if (lowerKey.includes('product') && !lowerKey.includes('variant')) {
    return 'product_name';
  }
  if (lowerKey.includes('price') || lowerKey.includes('prix') || lowerKey.includes('amount') || lowerKey.includes('total')) {
    return 'total';
  }
  if (lowerKey.includes('date') && !lowerKey.includes('delivery')) {
    return 'order_date';
  }
  if (lowerKey.includes('tracking') || lowerKey.includes('suivi')) {
    return 'tracking_number';
  }
  if (lowerKey.includes('confirmation') || lowerKey.includes('status') && !lowerKey.includes('delivery') && !lowerKey.includes('shipping')) {
    return 'status';
  }
  if (lowerKey.includes('delivery') || lowerKey.includes('shipping') || lowerKey.includes('livraison')) {
    return 'shipping_status';
  }
  if (lowerKey.includes('note') || lowerKey.includes('comment') || lowerKey.includes('remarque')) {
    return 'notes';
  }
  
  return null; // No confident match
}

// ============================================================
// MAPPING CONFIDENCE LEVELS
// ============================================================
export type MappingConfidence = 'matched' | 'needs_review' | 'not_mapped';

export function getMappingConfidence(sheetHeader: string, destinationField: string | null): MappingConfidence {
  if (!destinationField) {
    return 'not_mapped';
  }
  
  const suggestion = suggestDestinationField(sheetHeader);
  
  if (suggestion === destinationField) {
    return 'matched';
  }
  
  // If user chose something different from our suggestion, it needs review
  if (suggestion && suggestion !== destinationField) {
    return 'needs_review';
  }
  
  return 'needs_review';
}

// ============================================================
// SMART AUTO-MAPPING FOR ENTIRE SHEET
// ============================================================
export interface FieldMapping {
  sheetHeader: string;
  destinationField: string | null; // null means "do not import"
  confidence: MappingConfidence;
}

export function generateSmartMappings(sheetHeaders: string[]): FieldMapping[] {
  return sheetHeaders.map(header => {
    const suggestion = suggestDestinationField(header);
    return {
      sheetHeader: header,
      destinationField: suggestion,
      confidence: suggestion ? 'matched' : 'not_mapped'
    };
  });
}

// ============================================================
// GET DESTINATION FIELD INFO
// ============================================================
export function getDestinationFieldInfo(field: string) {
  return AVAILABLE_DESTINATION_FIELDS.find(f => f.field === field) || null;
}

// ============================================================
// VALIDATE DESTINATION FIELD
// ============================================================
export function isValidDestinationField(field: string): boolean {
  return AVAILABLE_DESTINATION_FIELDS.some(f => f.field === field);
}

// ============================================================
// GET ALL DESTINATION FIELDS BY CATEGORY
// ============================================================
export function getDestinationFieldsByCategory(category: string) {
  return AVAILABLE_DESTINATION_FIELDS.filter(f => f.category === category);
}

// ============================================================
// GET ALL CATEGORIES
// ============================================================
export function getMappingCategories(): string[] {
  const categories = new Set(AVAILABLE_DESTINATION_FIELDS.map(f => f.category));
  return Array.from(categories);
}
