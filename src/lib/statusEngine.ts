import { type Locale } from "../i18n/config";
import { translate, type TranslationKey } from "../i18n/translate";

export type CanonicalStatus =
  | 'pending'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'returned'
  | 'cancelled'
  | 'no_answer'
  | 'scheduled'
  | 'blacklisted'
  | 'duplicate'
  | 'unreachable'
  | 'wrong_number'
  | 'out_of_stock'
  | 'refused'
  | 'new'
  | 'busy';

export type StatusLanguage = Locale;

// ============================================================
// CANONICAL STATUS KEYS
// ============================================================
export const CANONICAL_STATUSES: CanonicalStatus[] = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'returned',
  'cancelled',
  'no_answer',
  'scheduled',
  'blacklisted',
  'duplicate',
  'unreachable',
  'wrong_number',
  'out_of_stock',
  'refused',
  'new',
  'busy',
];

// ============================================================
// STATUS COLORS
// ============================================================
export const STATUS_COLORS: Record<CanonicalStatus, string> = {
  new: 'blue',
  pending: 'amber',
  confirmed: 'green',
  scheduled: 'yellow',
  no_answer: 'orange',
  unreachable: 'orange',
  wrong_number: 'red',
  duplicate: 'orange',
  blacklisted: 'black',
  out_of_stock: 'gray',
  shipped: 'indigo',
  delivered: 'emerald',
  returned: 'purple',
  cancelled: 'red',
  refused: 'red',
  busy: 'orange',
};

// ============================================================
// STATUS ICONS
// ============================================================
export const STATUS_ICONS: Record<CanonicalStatus, string> = {
  pending: 'clock',
  confirmed: 'check-circle',
  shipped: 'truck',
  delivered: 'package-check',
  returned: 'arrow-return',
  cancelled: 'x-circle',
  no_answer: 'phone-missed',
  scheduled: 'calendar',
  blacklisted: 'user-x',
  duplicate: 'copy',
  unreachable: 'phone-off',
  wrong_number: 'phone-off',
  out_of_stock: 'package',
  refused: 'x',
  new: 'circle',
  busy: 'phone',
};

// ============================================================
// STATUS SORTING ORDER
// ============================================================
export const STATUS_SORT_ORDER: Record<CanonicalStatus, number> = {
  new: 0,
  pending: 1,
  confirmed: 2,
  scheduled: 3,
  shipped: 4,
  delivered: 5,
  returned: 6,
  cancelled: 7,
  no_answer: 8,
  unreachable: 9,
  wrong_number: 10,
  refused: 11,
  out_of_stock: 12,
  blacklisted: 13,
  duplicate: 14,
  busy: 15,
};

// ============================================================
// STATUS NORMALIZATION MAPPINGS
// ============================================================
const NORMALIZATION_MAP: Record<string, CanonicalStatus> = {
  // English variations
  'pending': 'pending',
  'Pending': 'pending',
  'PENDING': 'pending',
  'pending ': 'pending',
  'Pending ': 'pending',
  'PENDING ': 'pending',
  'Pending Order': 'pending',
  
  'confirmed': 'confirmed',
  'Confirmed': 'confirmed',
  'CONFIRMED': 'confirmed',
  'confirmed ': 'confirmed',
  'Confirmed ': 'confirmed',
  'CONFIRMED ': 'confirmed',
  
  'shipped': 'shipped',
  'Shipped': 'shipped',
  'SHIPPED': 'shipped',
  'shipped ': 'shipped',
  'Shipped ': 'shipped',
  'SHIPPED ': 'shipped',
  
  'delivered': 'delivered',
  'Delivered': 'delivered',
  'DELIVERED': 'delivered',
  'delivered ': 'delivered',
  'Delivered ': 'delivered',
  'DELIVERED ': 'delivered',
  
  'returned': 'returned',
  'Returned': 'returned',
  'RETURNED': 'returned',
  'returned ': 'returned',
  'Returned ': 'returned',
  'RETURNED ': 'returned',
  
  'cancelled': 'cancelled',
  'Cancelled': 'cancelled',
  'CANCELED': 'cancelled',
  'cancelled ': 'cancelled',
  'Cancelled ': 'cancelled',
  'CANCELED ': 'cancelled',
  'Canceled': 'cancelled',
  'canceled': 'cancelled',
  
  'no answer': 'no_answer',
  'No Answer': 'no_answer',
  'NO ANSWER': 'no_answer',
  'no answer ': 'no_answer',
  'No Answer ': 'no_answer',
  'NO ANSWER ': 'no_answer',
  
  'scheduled': 'scheduled',
  'Scheduled': 'scheduled',
  'SCHEDULED': 'scheduled',
  'scheduled ': 'scheduled',
  'Scheduled ': 'scheduled',
  'SCHEDULED ': 'scheduled',
  
  'blacklisted': 'blacklisted',
  'Blacklisted': 'blacklisted',
  'BLACKLISTED': 'blacklisted',
  'blacklisted ': 'blacklisted',
  'Blacklisted ': 'blacklisted',
  'BLACKLISTED ': 'blacklisted',
  'blacklist': 'blacklisted',
  'Blacklist': 'blacklisted',
  'BLACKLIST': 'blacklisted',
  
  'duplicate': 'duplicate',
  'Duplicate': 'duplicate',
  'DUPLICATE': 'duplicate',
  'duplicate ': 'duplicate',
  'Duplicate ': 'duplicate',
  'DUPLICATE ': 'duplicate',
  'double': 'duplicate',
  'Double': 'duplicate',
  'DOUBLE': 'duplicate',
  
  'unreachable': 'unreachable',
  'Unreachable': 'unreachable',
  'UNREACHABLE': 'unreachable',
  'unreachable ': 'unreachable',
  'Unreachable ': 'unreachable',
  'UNREACHABLE ': 'unreachable',
  
  'wrong number': 'wrong_number',
  'Wrong Number': 'wrong_number',
  'WRONG NUMBER': 'wrong_number',
  'wrong number ': 'wrong_number',
  'Wrong Number ': 'wrong_number',
  'WRONG NUMBER ': 'wrong_number',
  
  'out of stock': 'out_of_stock',
  'Out of Stock': 'out_of_stock',
  'OUT OF STOCK': 'out_of_stock',
  'out of stock ': 'out_of_stock',
  'Out of Stock ': 'out_of_stock',
  'OUT OF STOCK ': 'out_of_stock',
  'out_of_stock': 'out_of_stock',
  'Out_of_Stock': 'out_of_stock',
  
  'refused': 'refused',
  'Refused': 'refused',
  'REFUSED': 'refused',
  'refused ': 'refused',
  'Refused ': 'refused',
  'REFUSED ': 'refused',
  
  'new': 'new',
  'New': 'new',
  'NEW': 'new',
  'new ': 'new',
  'New ': 'new',
  'NEW ': 'new',
  
  'busy': 'busy',
  'Busy': 'busy',
  'BUSY': 'busy',
  'busy ': 'busy',
  'Busy ': 'busy',
  'BUSY ': 'busy',
  
  // French variations
  'en attente': 'pending',
  'En attente': 'pending',
  'EN ATTENTE': 'pending',
  'en attente ': 'pending',
  'En attente ': 'pending',
  'EN ATTENTE ': 'pending',
  
  'confirmé': 'confirmed',
  'Confirmé': 'confirmed',
  'CONFIRMÉ': 'confirmed',
  'confirme': 'confirmed',
  'Confirme': 'confirmed',
  'CONFIRME': 'confirmed',
  'confirmé ': 'confirmed',
  'Confirmé ': 'confirmed',
  'CONFIRMÉ ': 'confirmed',
  'confirme ': 'confirmed',
  'Confirme ': 'confirmed',
  'CONFIRME ': 'confirmed',
  
  'expédié': 'shipped',
  'Expédié': 'shipped',
  'EXPÉDIÉ': 'shipped',
  'expedie': 'shipped',
  'Expedie': 'shipped',
  'EXPEDIE': 'shipped',
  'expédié ': 'shipped',
  'Expédié ': 'shipped',
  'EXPÉDIÉ ': 'shipped',
  'expedie ': 'shipped',
  'Expedie ': 'shipped',
  'EXPEDIE ': 'shipped',
  
  'livré': 'delivered',
  'Livré': 'delivered',
  'LIVRÉ': 'delivered',
  'livre': 'delivered',
  'Livre': 'delivered',
  'LIVRE': 'delivered',
  'livré ': 'delivered',
  'Livré ': 'delivered',
  'LIVRÉ ': 'delivered',
  'livre ': 'delivered',
  'Livre ': 'delivered',
  'LIVRE ': 'delivered',
  
  'retourné': 'returned',
  'Retourné': 'returned',
  'RETOURNÉ': 'returned',
  'retourne': 'returned',
  'Retourne': 'returned',
  'RETOURNE': 'returned',
  'retourné ': 'returned',
  'Retourné ': 'returned',
  'RETOURNÉ ': 'returned',
  'retourne ': 'returned',
  'Retourne ': 'returned',
  'RETOURNE ': 'returned',
  
  'annulé': 'cancelled',
  'Annulé': 'cancelled',
  'ANNULÉ': 'cancelled',
  'annule': 'cancelled',
  'Annule': 'cancelled',
  'ANNULE': 'cancelled',
  'annulé ': 'cancelled',
  'Annulé ': 'cancelled',
  'ANNULÉ ': 'cancelled',
  'annule ': 'cancelled',
  'Annule ': 'cancelled',
  'ANNULE ': 'cancelled',
  
  'pas de réponse': 'no_answer',
  'Pas de réponse': 'no_answer',
  'PAS DE RÉPONSE': 'no_answer',
  'pas de reponse': 'no_answer',
  'Pas de reponse': 'no_answer',
  'PAS DE REPONSE': 'no_answer',
  'pas de réponse ': 'no_answer',
  'Pas de réponse ': 'no_answer',
  'PAS DE RÉPONSE ': 'no_answer',
  'pas de reponse ': 'no_answer',
  'Pas de reponse ': 'no_answer',
  'PAS DE REPONSE ': 'no_answer',
  
  'reporté': 'scheduled',
  'Reporté': 'scheduled',
  'REPORTE': 'scheduled',
  'reporte': 'scheduled',
  'Reporte': 'scheduled',
  'reporté ': 'scheduled',
  'Reporté ': 'scheduled',
  'reporte ': 'scheduled',
  'Reporte ': 'scheduled',
  
  'blacklisté': 'blacklisted',
  'Blacklisté': 'blacklisted',
  'BLACKLISTÉ': 'blacklisted',
  'blackliste': 'blacklisted',
  'Blackliste': 'blacklisted',
  'BLACKLISTE': 'blacklisted',
  'blacklisté ': 'blacklisted',
  'Blacklisté ': 'blacklisted',
  'BLACKLISTÉ ': 'blacklisted',
  'blackliste ': 'blacklisted',
  'Blackliste ': 'blacklisted',
  'BLACKLISTE ': 'blacklisted',
  
  'doublon': 'duplicate',
  'Doublon': 'duplicate',
  'DOUBLON': 'duplicate',
  'doublon ': 'duplicate',
  'Doublon ': 'duplicate',
  
  'injoignable': 'unreachable',
  'Injoignable': 'unreachable',
  'INJOIGNABLE': 'unreachable',
  'injoignable ': 'unreachable',
  'Injoignable ': 'unreachable',
  
  'mauvais numéro': 'wrong_number',
  'Mauvais numéro': 'wrong_number',
  'MAUVAIS NUMÉRO': 'wrong_number',
  'mauvais numero': 'wrong_number',
  'Mauvais numero': 'wrong_number',
  'MAUVAIS NUMERO': 'wrong_number',
  'mauvais numéro ': 'wrong_number',
  'Mauvais numéro ': 'wrong_number',
  'mauvais numero ': 'wrong_number',
  'Mauvais numero ': 'wrong_number',
  
  'produit indisponible': 'out_of_stock',
  'Produit indisponible': 'out_of_stock',
  'PRODUIT INDISPONIBLE': 'out_of_stock',
  'produit indisponible ': 'out_of_stock',
  'Produit indisponible ': 'out_of_stock',
  
  'refusé': 'refused',
  'Refusé': 'refused',
  'REFUSÉ': 'refused',
  'refuse': 'refused',
  'Refuse': 'refused',
  'REFUSE': 'refused',
  'refusé ': 'refused',
  'Refusé ': 'refused',
  'refuse ': 'refused',
  'Refuse ': 'refused',
  
  'nouveau': 'new',
  'Nouveau': 'new',
  'NOUVEAU': 'new',
  'nouveau ': 'new',
  'Nouveau ': 'new',
  
  'occupé': 'busy',
  'Occupé': 'busy',
  'OCCUPÉ': 'busy',
  'occupe': 'busy',
  'Occupe': 'busy',
  'OCCUPE': 'busy',
  'occupé ': 'busy',
  'Occupé ': 'busy',
  'occupe ': 'busy',
  'Occupe ': 'busy',
  
  // Additional common variations
  'voicemail': 'no_answer',
  'Voicemail': 'no_answer',
  'VOICEMAIL': 'no_answer',
  'boite vocale': 'no_answer',
  'boite vocal': 'no_answer',
  'boîte vocale': 'no_answer',
  'boîte vocal': 'no_answer',
  'messagerie': 'no_answer',
  
  'callback': 'scheduled',
  'Callback': 'scheduled',
  'CALLBACK': 'scheduled',
  'call back': 'scheduled',
  'Call Back': 'scheduled',
  'CALL BACK': 'scheduled',
  'rappel': 'scheduled',
  'Rappel': 'scheduled',
  'RAPPEL': 'scheduled',
  
  'travelling': 'scheduled',
  'traveling': 'scheduled',
  'Travelling': 'scheduled',
  'Traveling': 'scheduled',
  'en déplacement': 'scheduled',
  'en deplacement': 'scheduled',
  'en voyage': 'scheduled',
  'rappeler plus tard': 'scheduled',
  'programme': 'scheduled',
  'programmé': 'scheduled',
  'saisie': 'pending',
  'client pas sérieux': 'blacklisted',
  'client pas serieux': 'blacklisted',
  
  'postponed': 'scheduled',
  'Postponed': 'scheduled',
  'POSTPONED': 'scheduled',
  
  'unavailable': 'unreachable',
  'Unavailable': 'unreachable',
  'UNAVAILABLE': 'unreachable',
  'indisponible': 'unreachable',
  'Indisponible': 'unreachable',
  'INDISPONIBLE': 'unreachable',
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Normalize a raw status string to a canonical status key
 */
export function normalizeStatus(rawStatus: string | null | undefined): CanonicalStatus {
  return normalizeStatusOrNull(rawStatus) ?? 'pending';
}

/** Normalize without inventing a status for an unknown provider/custom value. */
export function normalizeStatusOrNull(rawStatus: string | null | undefined): CanonicalStatus | null {
  if (!rawStatus) return null;
  
  const trimmed = rawStatus.trim();
  const lower = trimmed.toLowerCase();
  
  // Check exact match first
  if (CANONICAL_STATUSES.includes(lower as CanonicalStatus)) {
    return lower as CanonicalStatus;
  }
  
  // Check normalization map
  const normalized = NORMALIZATION_MAP[trimmed] || NORMALIZATION_MAP[lower];
  if (normalized) {
    return normalized;
  }
  
  return null;
}

/**
 * Get all canonical statuses
 */
export function getAllStatuses(): CanonicalStatus[] {
  return [...CANONICAL_STATUSES];
}

/**
 * Get the translated label for a status
 */
export function getStatusLabel(status: CanonicalStatus, language: StatusLanguage = 'en'): string {
  return translate(language, `status.${status}` as TranslationKey);
}

/**
 * Alias for getStatusLabel for consistency
 */
export function translateStatus(status: CanonicalStatus, language: StatusLanguage = 'en'): string {
  return getStatusLabel(status, language);
}

/**
 * Get the color for a status
 */
export function getStatusColor(status: CanonicalStatus): string {
  return STATUS_COLORS[status] || 'gray';
}

/**
 * Get the icon name for a status
 */
export function getStatusIcon(status: CanonicalStatus): string {
  return STATUS_ICONS[status] || 'circle';
}

/**
 * Get the sort order for a status
 */
export function getStatusSortOrder(status: CanonicalStatus): number {
  return STATUS_SORT_ORDER[status] ?? 999;
}

/**
 * Get all status options for a select dropdown (translated)
 */
export function getStatusOptions(language: StatusLanguage = 'en'): Array<{ value: CanonicalStatus; label: string }> {
  return CANONICAL_STATUSES.map(status => ({
    value: status,
    label: getStatusLabel(status, language),
  }));
}

/**
 * Get status options sorted by sort order
 */
export function getSortedStatusOptions(language: StatusLanguage = 'en'): Array<{ value: CanonicalStatus; label: string }> {
  return getStatusOptions(language).sort((a, b) => 
    getStatusSortOrder(a.value) - getStatusSortOrder(b.value)
  );
}

/**
 * Get Tailwind CSS classes for a status badge
 */
export function getStatusBadgeClasses(status: CanonicalStatus): string {
  const color = getStatusColor(status);
  
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    green: 'bg-green-100 text-green-800 border-green-200',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    orange: 'bg-orange-100 text-orange-800 border-orange-200',
    red: 'bg-red-100 text-red-800 border-red-200',
    black: 'bg-gray-900 text-white border-gray-700',
    gray: 'bg-gray-100 text-gray-800 border-gray-200',
    indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    purple: 'bg-purple-100 text-purple-800 border-purple-200',
  };
  
  return colorMap[color] || colorMap.gray;
}

/**
 * Check if a status is a canonical status
 */
export function isCanonicalStatus(status: string): status is CanonicalStatus {
  return CANONICAL_STATUSES.includes(status as CanonicalStatus);
}
