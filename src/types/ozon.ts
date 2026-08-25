// ─── Ozon Express API Types ───────────────────────────────────────────────────
// Based on the official Ozon Express (ozonexpress.ma) API documentation.
// These types mirror the exact field names expected by their multipart/form-data
// endpoints and the JSON response shapes they return.

/**
 * Authentication credentials for Ozon Express API.
 * Obtained from the Ozon Express merchant dashboard.
 */
export interface OzonConfig {
  clientId: string;
  apiKey: string;
  /**
   * When true, build URLs as apiKey/clientId instead of clientId/apiKey.
   * Some Ozon endpoint versions require a swapped credential order.
   */
  apiKeyFirst?: boolean;
}


/**
 * Request payload for creating a new parcel via `POST /add-parcel`.
 *
 * Field names use the hyphenated format required by the Ozon form-data endpoint.
 * All monetary values are in MAD (Moroccan Dirham).
 */
export interface OzonParcelRequest {
  /** Nom complet du destinataire */
  "parcel-receiver": string;
  /** Téléphone du destinataire (e.g. "0612345678") */
  "parcel-phone": string;
  /** ID de la ville Ozon (e.g. "1" for Casablanca) */
  "parcel-city": string;
  /** Adresse complète de livraison */
  "parcel-address": string;
  /** Prix du colis en MAD — montant COD à encaisser */
  "parcel-price": number;
  /** Numéro de suivi personnalisé (optionnel, Ozon en génère un sinon) */
  "parcel-number"?: string;
  /** Instructions spéciales pour le livreur */
  "parcel-note"?: string;
  /** Description du contenu du colis */
  "parcel-nature"?: string;
  /** 1 = colis en stock (dépôt Ozon), 0 = ramassage à domicile */
  "parcel-stock"?: number;
}

/**
 * Response returned by Ozon Express after successful parcel creation.
 * All values come back as strings from the API.
 */
export interface OzonParcelResponse {
  "TRACKING-NUMBER": string;
  "RECEIVER": string;
  "PHONE": string;
  "CITY_ID": string;
  "CITY_NAME": string;
  "ADDRESS": string;
  "PRICE": string;
  /** Price charged on successful delivery */
  "DELIVERED-PRICE": string;
  /** Price charged on return */
  "RETURNED-PRICE": string;
  /** Price charged on refusal */
  "REFUSED-PRICE": string;
}

/**
 * Standardized result shape returned by all ozonService functions.
 */
export interface OzonResult<T = void> {
  success: boolean;
  data?: T;
  trackingNumber?: string;
  error?: string;
}

export interface OzonTrackingStatus {
  STATUT: string;
  COMMENT: string;
  TIME: string;
  TIME_STR: string;
}

/**
 * Response returned by Ozon Express after tracking query.
 */
export interface OzonTrackingResponse {
  CHECK_API?: { RESULT: string; MESSAGE: string };
  TRACKING?: {
    RESULT: string;
    MESSAGE: string;
    "TRACKING-NUMBER": string;
    LAST_TRACKING: OzonTrackingStatus;
    HISTORY: Record<string, OzonTrackingStatus>;
  };
}


/**
 * Response returned by Ozon Express after creating a delivery note.
 */
export interface OzonDeliveryNoteResult {
  success: boolean;
  ref?: string;
  pdfUrl?: string;
  error?: string;
}

