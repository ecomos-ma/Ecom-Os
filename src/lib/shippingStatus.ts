/**
 * Centralized Shipping Status System
 * 
 * This file contains all shipping status codes, translations, colors, and icons.
 * The database uses internal status codes, and the UI handles translation.
 */

import { 
  LucideIcon, 
  PackagePlus, 
  Send, 
  Truck, 
  PackageCheck, 
  Clock3, 
  CalendarClock, 
  Warehouse, 
  Bike, 
  CircleCheckBig, 
  CircleX, 
  UserX, 
  Ban, 
  Undo2, 
  RefreshCw, 
  XCircle, 
  SearchX, 
  PackageX, 
  PauseCircle, 
  HelpCircle,
  PhoneOff
} from "lucide-react";
import { type Locale } from "../i18n/config";
import { translate, type TranslationKey } from "../i18n/translate";

export type ShippingStatus = 
  | "NEW_PARCEL"
  | "WAITING_PICKUP"
  | "PICKED_UP"
  | "RECEIVED_AT_WAREHOUSE"
  | "IN_DISTRIBUTION"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CUSTOMER_UNREACHABLE"
  | "NO_ANSWER"
  | "PHONE_OFF"
  | "WRONG_ADDRESS"
  | "RESCHEDULE_REQUESTED"
  | "REFUSED"
  | "DELIVERY_FAILED"
  | "RETURNED_TO_AGENCY"
  | "RETURN_TO_DEPOT"
  | "RETURN_IN_PROGRESS"
  | "RETURNED_TO_SENDER"
  | "CANCELED";

export type ShippingLanguage = Locale;

export interface ShippingStatusConfig {
  code: ShippingStatus;
  colors: {
    background: string;
    text: string;
    border: string;
  };
  icon: LucideIcon;
}

const SHIPPING_STATUS_CONFIG: Record<ShippingStatus, ShippingStatusConfig> = {
  NEW_PARCEL: {
    code: "NEW_PARCEL",
    colors: {
      background: "#E0F2FE",
      text: "#0369A1",
      border: "#7DD3FC",
    },
    icon: PackagePlus,
  },
  WAITING_PICKUP: {
    code: "WAITING_PICKUP",
    colors: {
      background: "#FEF3C7",
      text: "#B45309",
      border: "#FCD34D",
    },
    icon: Clock3,
  },
  PICKED_UP: {
    code: "PICKED_UP",
    colors: {
      background: "#DBEAFE",
      text: "#1D4ED8",
      border: "#93C5FD",
    },
    icon: PackageCheck,
  },
  RECEIVED_AT_WAREHOUSE: {
    code: "RECEIVED_AT_WAREHOUSE",
    colors: {
      background: "#EDE9FE",
      text: "#6D28D9",
      border: "#C4B5FD",
    },
    icon: Warehouse,
  },
  IN_DISTRIBUTION: {
    code: "IN_DISTRIBUTION",
    colors: {
      background: "#F3E8FF",
      text: "#7E22CE",
      border: "#D8B4FE",
    },
    icon: Truck,
  },
  IN_TRANSIT: {
    code: "IN_TRANSIT",
    colors: {
      background: "#DBEAFE",
      text: "#1D4ED8",
      border: "#93C5FD",
    },
    icon: Truck,
  },
  OUT_FOR_DELIVERY: {
    code: "OUT_FOR_DELIVERY",
    colors: {
      background: "#CFFAFE",
      text: "#0F766E",
      border: "#67E8F9",
    },
    icon: Bike,
  },
  DELIVERED: {
    code: "DELIVERED",
    colors: {
      background: "#DCFCE7",
      text: "#15803D",
      border: "#86EFAC",
    },
    icon: CircleCheckBig,
  },
  CUSTOMER_UNREACHABLE: {
    code: "CUSTOMER_UNREACHABLE",
    colors: {
      background: "#FEF3C7",
      text: "#92400E",
      border: "#FBBF24",
    },
    icon: UserX,
  },
  NO_ANSWER: {
    code: "NO_ANSWER",
    colors: {
      background: "#FEF3C7",
      text: "#B45309",
      border: "#FCD34D",
    },
    icon: UserX,
  },
  PHONE_OFF: {
    code: "PHONE_OFF",
    colors: {
      background: "#FDE68A",
      text: "#92400E",
      border: "#FBBF24",
    },
    icon: PhoneOff,
  },
  WRONG_ADDRESS: {
    code: "WRONG_ADDRESS",
    colors: {
      background: "#FED7AA",
      text: "#C2410C",
      border: "#FB923C",
    },
    icon: SearchX,
  },
  RESCHEDULE_REQUESTED: {
    code: "RESCHEDULE_REQUESTED",
    colors: {
      background: "#DBEAFE",
      text: "#2563EB",
      border: "#93C5FD",
    },
    icon: CalendarClock,
  },
  REFUSED: {
    code: "REFUSED",
    colors: {
      background: "#FECACA",
      text: "#B91C1C",
      border: "#F87171",
    },
    icon: Ban,
  },
  DELIVERY_FAILED: {
    code: "DELIVERY_FAILED",
    colors: {
      background: "#FCA5A5",
      text: "#991B1B",
      border: "#EF4444",
    },
    icon: CircleX,
  },
  RETURNED_TO_AGENCY: {
    code: "RETURNED_TO_AGENCY",
    colors: {
      background: "#F3F4F6",
      text: "#4B5563",
      border: "#D1D5DB",
    },
    icon: Warehouse,
  },
  RETURN_TO_DEPOT: {
    code: "RETURN_TO_DEPOT",
    colors: {
      background: "#F3F4F6",
      text: "#4B5563",
      border: "#D1D5DB",
    },
    icon: Warehouse,
  },
  RETURN_IN_PROGRESS: {
    code: "RETURN_IN_PROGRESS",
    colors: {
      background: "#E5E7EB",
      text: "#374151",
      border: "#9CA3AF",
    },
    icon: RefreshCw,
  },
  RETURNED_TO_SENDER: {
    code: "RETURNED_TO_SENDER",
    colors: {
      background: "#FECACA",
      text: "#991B1B",
      border: "#EF4444",
    },
    icon: Undo2,
  },
  CANCELED: {
    code: "CANCELED",
    colors: {
      background: "#E5E7EB",
      text: "#6B7280",
      border: "#9CA3AF",
    },
    icon: XCircle,
  },
};

/**
 * Get the translated label for a shipping status
 */
export function getShippingStatusLabel(status: ShippingStatus | string | null | undefined, language: ShippingLanguage = "en"): string {
  if (!status) return "—";
  
  // Normalize the status first to handle legacy values
  const normalizedStatus = normalizeShippingStatus(status) || String(status).toUpperCase().trim() as ShippingStatus;
  const config = SHIPPING_STATUS_CONFIG[normalizedStatus];
  
  if (!config) {
    // Return the original status if not found in config
    return String(status);
  }
  
  return translate(language, `shippingStatus.${normalizedStatus}` as TranslationKey);
}

/**
 * Get the color classes for a shipping status badge
 */
export function getShippingStatusColors(status: ShippingStatus | string | null | undefined): {
  background: string;
  text: string;
  border: string;
} {
  if (!status) {
    return {
      background: "#F3F4F6",
      text: "#6B7280",
      border: "#D1D5DB",
    };
  }
  
  // Normalize the status first to handle legacy values
  const normalizedStatus = normalizeShippingStatus(status) || String(status).toUpperCase().trim() as ShippingStatus;
  const config = SHIPPING_STATUS_CONFIG[normalizedStatus];
  
  if (!config) {
    // Default gray for unknown statuses
    return {
      background: "#F3F4F6",
      text: "#6B7280",
      border: "#D1D5DB",
    };
  }
  
  return config.colors;
}

/**
 * Check if a shipping status is a final status (no further updates expected)
 */
export function isFinalShippingStatus(status: ShippingStatus | string | null | undefined): boolean {
  if (!status) return false;
  
  const normalizedStatus = normalizeShippingStatus(String(status));
  if (!normalizedStatus) return false;
  const finalStatuses: ShippingStatus[] = [
    "DELIVERED",
    "REFUSED",
    "DELIVERY_FAILED",
    "RETURNED_TO_SENDER",
    "CANCELED",
  ];
  
  return finalStatuses.includes(normalizedStatus);
}

/**
 * Get all available shipping status codes
 */
export function getAllShippingStatuses(): ShippingStatus[] {
  return Object.keys(SHIPPING_STATUS_CONFIG) as ShippingStatus[];
}

/**
 * Get shipping status config by code
 */
export function getShippingStatusConfig(status: ShippingStatus | string | null | undefined): ShippingStatusConfig | null {
  if (!status) return null;
  
  const normalizedStatus = normalizeShippingStatus(status) || String(status).toUpperCase().trim() as ShippingStatus;
  return SHIPPING_STATUS_CONFIG[normalizedStatus] || null;
}

/**
 * Get the icon component for a shipping status
 */
export function getShippingStatusIcon(status: ShippingStatus | string | null | undefined): LucideIcon {
  if (!status) return HelpCircle;
  
  const normalizedStatus = normalizeShippingStatus(status) || String(status).toUpperCase().trim() as ShippingStatus;
  const config = SHIPPING_STATUS_CONFIG[normalizedStatus];
  
  if (!config) return HelpCircle;
  
  return config.icon;
}

/**
 * Legacy status mapping: Convert old status strings to new internal codes
 * This is for backward compatibility with existing data
 */
export function normalizeShippingStatus(status: string | null | undefined): ShippingStatus | null {
  if (!status) return null;
  
  const normalized = String(status).toUpperCase().trim();
  
  // Direct match
  if (SHIPPING_STATUS_CONFIG[normalized as ShippingStatus]) {
    return normalized as ShippingStatus;
  }
  
  // Legacy mappings (comprehensive with mixed case support)
  const legacyMap: Record<string, ShippingStatus> = {
    // NEW_PARCEL variants
    "NOUVEAU COLIS": "NEW_PARCEL",
    "NEW PARCEL": "NEW_PARCEL",
    "Nouveau Colis": "NEW_PARCEL",
    "New Parcel": "NEW_PARCEL",
    
    // WAITING_PICKUP variants
    "PENDING": "WAITING_PICKUP",
    "AWAITING PICKUP": "WAITING_PICKUP",
    "EN ATTENTE": "WAITING_PICKUP",
    "WAITING FOR PICKUP": "WAITING_PICKUP",
    "En Attente de Ramassage": "WAITING_PICKUP",
    "Awaiting Pickup": "WAITING_PICKUP",
    "Waiting for Pickup": "WAITING_PICKUP",
    
    // PICKED_UP variants
    "PICKED UP": "PICKED_UP",
    "RAMASSÉ": "PICKED_UP",
    "RAMASSE": "PICKED_UP",
    "Ramassé": "PICKED_UP",
    "Picked Up": "PICKED_UP",
    
    // RECEIVED_AT_WAREHOUSE variants
    "RECEIVED AT WAREHOUSE": "RECEIVED_AT_WAREHOUSE",
    "REÇU EN AGENCE": "RECEIVED_AT_WAREHOUSE",
    "Reçu en Agence": "RECEIVED_AT_WAREHOUSE",
    "Received at Warehouse": "RECEIVED_AT_WAREHOUSE",
    
    // IN_DISTRIBUTION variants
    "IN TRANSIT": "IN_TRANSIT",
    "EN ROUTE": "IN_DISTRIBUTION",
    "EN COURS": "IN_DISTRIBUTION",
    "Mise en Distribution": "IN_DISTRIBUTION",
    "In Transit": "IN_TRANSIT",
    "In Distribution": "IN_DISTRIBUTION",
    
    // OUT_FOR_DELIVERY variants
    "OUT FOR DELIVERY": "OUT_FOR_DELIVERY",
    "EN LIVRAISON": "OUT_FOR_DELIVERY",
    "En Cours de Livraison": "OUT_FOR_DELIVERY",
    "Out for Delivery": "OUT_FOR_DELIVERY",
    
    // DELIVERED variants
    "DELIVERED": "DELIVERED",
    "LIVRÉ": "DELIVERED",
    "LIVRE": "DELIVERED",
    "Livré": "DELIVERED",
    "Delivered": "DELIVERED",
    
    // CUSTOMER_UNREACHABLE variants
    "CUSTOMER UNREACHABLE": "CUSTOMER_UNREACHABLE",
    "CLIENT INJOIGNABLE": "CUSTOMER_UNREACHABLE",
    "Client Injoignable": "CUSTOMER_UNREACHABLE",
    "Customer Unreachable": "CUSTOMER_UNREACHABLE",
    
    // NO_ANSWER variants
    "NO ANSWER": "NO_ANSWER",
    "PAS DE RÉPONSE": "NO_ANSWER",
    "NE RÉPOND PAS": "NO_ANSWER",
    "Ne Répond Pas": "NO_ANSWER",
    "No Answer": "NO_ANSWER",
    
    // PHONE_OFF variants
    "PHONE OFF": "PHONE_OFF",
    "TÉLÉPHONE ÉTEINT": "PHONE_OFF",
    "Téléphone Éteint": "PHONE_OFF",
    "Phone Off": "PHONE_OFF",
    
    // WRONG_ADDRESS variants
    "WRONG ADDRESS": "WRONG_ADDRESS",
    "ADRESSE INCORRECTE": "WRONG_ADDRESS",
    "Adresse Incorrecte": "WRONG_ADDRESS",
    "Wrong Address": "WRONG_ADDRESS",
    
    // RESCHEDULE_REQUESTED variants
    "RESCHEDULE REQUESTED": "RESCHEDULE_REQUESTED",
    "REPORT DEMANDÉ PAR LE CLIENT": "RESCHEDULE_REQUESTED",
    "Report Demandé par le Client": "RESCHEDULE_REQUESTED",
    "Customer Requested Reschedule": "RESCHEDULE_REQUESTED",
    
    // REFUSED variants
    "REFUSED": "REFUSED",
    "REFUSÉ": "REFUSED",
    "REFUSE": "REFUSED",
    "Refusé": "REFUSED",
    "Refused": "REFUSED",
    
    // DELIVERY_FAILED variants
    "DELIVERY FAILED": "DELIVERY_FAILED",
    "ÉCHEC DE LIVRAISON": "DELIVERY_FAILED",
    "Échec de Livraison": "DELIVERY_FAILED",
    "Delivery Failed": "DELIVERY_FAILED",
    
    // RETURNED_TO_AGENCY variants
    "RETURNED TO AGENCY": "RETURNED_TO_AGENCY",
    "RETOUR À L'AGENCE": "RETURNED_TO_AGENCY",
    "Retour à l'Agence": "RETURNED_TO_AGENCY",
    "Returned to Agency": "RETURNED_TO_AGENCY",

    // RETURN_TO_DEPOT variants
    "RETURN TO DEPOT": "RETURN_TO_DEPOT",
    "RETOUR AU DÉPÔT": "RETURN_TO_DEPOT",
    "RETOUR AU DEPOT": "RETURN_TO_DEPOT",
    
    // RETURN_IN_PROGRESS variants
    "RETURN IN PROGRESS": "RETURN_IN_PROGRESS",
    "RETOUR EN COURS": "RETURN_IN_PROGRESS",
    "Retour en Cours": "RETURN_IN_PROGRESS",
    "Return in Progress": "RETURN_IN_PROGRESS",
    
    // RETURNED_TO_SENDER variants
    "RETURNED": "RETURNED_TO_SENDER",
    "RETOURNÉ": "RETURNED_TO_SENDER",
    "RETOUR": "RETURNED_TO_SENDER",
    "Retourné": "RETURNED_TO_SENDER",
    "Returned": "RETURNED_TO_SENDER",
    "Returned to Sender": "RETURNED_TO_SENDER",
    "RETURNED TO INVENTORY": "RETURNED_TO_SENDER",
    "RETURN DONE": "RETURNED_TO_SENDER",
    "RETURN_DONE": "RETURNED_TO_SENDER",
    
    // CANCELED variants
    "CANCELLED": "CANCELED",
    "ANNULÉ": "CANCELED",
    "ANNULE": "CANCELED",
    "Annulé": "CANCELED",
    "Canceled": "CANCELED",
    "LOST": "DELIVERY_FAILED",
    "FAILED DELIVERY": "DELIVERY_FAILED",
    "ARCHIVED": "CANCELED",
  };
  
  return legacyMap[normalized] || legacyMap[status] || null;
}
