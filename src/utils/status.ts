export type InternalStatus = 'NEW' | 'CONFIRMED' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'COMING_BACK' | 'PROCESSED';

/**
 * Normalize a raw shipping/order status string to one of 6 internal buckets.
 *
 * Handles THREE input formats:
 *  1. Canonical codes from shippingStatus.ts:  "OUT_FOR_DELIVERY", "IN_DISTRIBUTION", etc.
 *  2. Raw French strings:  "En Cours de Livraison", "Livré", "Retourné"
 *  3. Raw English strings: "Out for Delivery", "Delivered", "Refused"
 *
 * Step A: Check for canonical codes first (fast path)
 * Step B: Normalize string (strip accents, lowercase, remove punctuation)
 * Step C: Exact set match
 * Step D: Keyword fallback for unknown carrier labels
 */
export function normalizeStatus(status: string | null | undefined): InternalStatus {
    if (!status) return 'NEW';

    // ── Step A: Canonical code fast-path ─────────────────────────
    // These are the codes stored directly by shippingStatus.ts in delivery_status column
    const upper = status.toUpperCase().replace(/[\s\-]/g, '_').trim();

    // OUT_FOR_DELIVERY canonical codes
    if ([
        'OUT_FOR_DELIVERY',
        'IN_DISTRIBUTION',
        'IN_TRANSIT',
        'CUSTOMER_UNREACHABLE',
        'NO_ANSWER',
        'PHONE_OFF',
        'WRONG_ADDRESS',
        'RESCHEDULE_REQUESTED',
    ].includes(upper)) {
        return 'OUT_FOR_DELIVERY';
    }

    // READY canonical codes
    if ([
        'NEW_PARCEL',
        'WAITING_PICKUP',
        'PICKED_UP',
        'RECEIVED_AT_WAREHOUSE',
    ].includes(upper)) {
        return 'READY';
    }

    // DELIVERED canonical code
    if (upper === 'DELIVERED') return 'DELIVERED';

    // COMING_BACK canonical codes
    if ([
        'REFUSED',
        'DELIVERY_FAILED',
        'RETURNED_TO_AGENCY',
        'RETURN_IN_PROGRESS',
        'RETURNED_TO_SENDER',
        'RETURNED',
        'CANCELED',
        'CANCELLED',
    ].includes(upper)) {
        return 'COMING_BACK';
    }

    // CONFIRMED canonical
    if (['CONFIRMED', 'CONFIRME', 'CONFIRMEE'].includes(upper)) return 'CONFIRMED';

    // ── Step B: Normalize string for raw text matching ────────────
    const s = status
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')   // strip accents (é→e, à→a, etc.)
        .replace(/[_\-]/g, ' ')            // underscores/dashes → space
        .replace(/[^\w\s]/g, '')           // strip remaining punctuation
        .replace(/\s+/g, ' ')             // collapse spaces
        .trim();

    // ── Step C: Exact set matches ─────────────────────────────────

    // DELIVERED
    if (['livre', 'livree', 'delivered', 'livraison effectuee', 'remis'].includes(s)) {
        return 'DELIVERED';
    }

    // RETURN_DONE - treated as DELIVERED (final return status)
    if (['return done', 'retour termine', 'retour effectue', 'return completed'].includes(s)) {
        return 'DELIVERED';
    }

    // COMING BACK
    const COMING_BACK_SET = new Set([
        'refuse', 'refused', 'refus',
        'retourne', 'retournee', 'returned',
        'retourne a l expediteur', 'return to sender', 'rts',
        'annule', 'annulee', 'cancelled', 'canceled', 'annulation',
        'non livre', 'non livree', 'undelivered', 'echec de livraison',
        'retour a l agence', 'returned to agency',
        'retour en cours', 'return in progress',
    ]);
    if (COMING_BACK_SET.has(s)) return 'COMING_BACK';

    // OUT FOR DELIVERY
    const OFD_SET = new Set([
        // French
        'mise en distribution', 'en distribution', 'distribution',
        'en cours de livraison', 'en livraison', 'en cours',
        'en route', 'sorti pour livraison',
        'chez le livreur', 'avec le livreur',
        'en tournee', 'tournee',
        'dernier kilometre', 'dernier km',
        'livraison programmee', 'livraison programme',
        'tentative de livraison',
        'client contacte', 'client injoignable',
        'ne repond pas', 'pas de reponse',
        'telephone eteint', 'adresse incorrecte',
        'report demande par le client',
        // English
        'out for delivery', 'out for deliveries',
        'in delivery', 'in transit',
        'on the way', 'on route', 'on its way',
        'dispatched', 'dispatch',
        'with courier', 'courier assigned',
        'vehicle for delivery',
        'last mile delivery', 'last mile',
        'delivery in progress',
        'delivery scheduled',
        'delivery attempt',
        'driver assigned',
        'customer contacted',
        'customer unreachable',
        'no answer',
        'phone off', 'wrong address',
        'reschedule requested',
        'shipping',
        // Carrier misc
        'in movement', 'en mouvement',
        'en acheminement', 'acheminement',
        'arrive agence livraison', 'arrive en agence de livraison',
        'transferred to local courier',
    ]);
    if (OFD_SET.has(s)) return 'OUT_FOR_DELIVERY';

    // READY
    const READY_SET = new Set([
        'nouveau colis', 'new parcel',
        'en attente de ramassage', 'attente de ramassage', 'attente ramassage', 'waiting for pickup',
        'ramasse', 'picked up', 'collecte', 'enleve',
        'recu en agence', 'received at agency', 'received at warehouse',
        'arrive en agence', 'arrivee en agence',
        'en attente', 'waiting', 'pending',
        'registered', 'enregistre', 'cree',
    ]);
    if (READY_SET.has(s)) return 'READY';

    // CONFIRMED
    if (['confirme', 'confirmee', 'confirmed'].includes(s)) return 'CONFIRMED';

    // ── Step D: Keyword fallback ──────────────────────────────────

    // OUT_FOR_DELIVERY keyword detection
    const OFD_KEYWORDS = ['livraison', 'distribution', 'tournee', 'livreur', 'delivery', 'transit', 'courier', 'dispatch', 'driver', 'last mile', 'en route', 'on route'];
    for (const kw of OFD_KEYWORDS) {
        if (s.includes(kw) && !s.includes('non ') && !s.includes('echec') && !s.includes('return') && !s.includes('retour')) {
            return 'OUT_FOR_DELIVERY';
        }
    }

    // DELIVERED keyword fallback (after OFD)
    if ((s.includes('livre') || s.includes('delivered') || s.includes('remis')) && !s.includes('non ') && !s.includes('echec') && !s.includes('tentative')) {
        return 'DELIVERED';
    }

    // COMING_BACK keyword fallback
    const BACK_KEYWORDS = ['retour', 'refuse', 'annul', 'return', 'cancel', 'rts'];
    for (const kw of BACK_KEYWORDS) {
        if (s.includes(kw)) return 'COMING_BACK';
    }

    // READY keyword fallback
    if (s.includes('ramass') || s.includes('pickup') || s.includes('agence') || s.includes('collecte')) {
        return 'READY';
    }

    return 'NEW';
}
