-- ═══════════════════════════════════════════════════════════════
-- 062_expand_ofd_status_mapping.sql
-- Update normalize_status() with expanded OUT_FOR_DELIVERY strings
-- and keyword-based fallback to match the frontend logic exactly
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.normalize_status(raw_status TEXT)
RETURNS TEXT AS $$
DECLARE
    s TEXT;
BEGIN
    -- Step 1: Normalize — lowercase, strip accents, replace dashes/underscores with space
    s := LOWER(TRIM(COALESCE(raw_status, '')));
    -- Replace dashes and underscores
    s := REGEXP_REPLACE(s, '[_\-]', ' ', 'g');
    -- Strip punctuation (keep letters, digits, spaces)
    s := REGEXP_REPLACE(s, '[^\w\s]', '', 'g');
    -- Collapse multiple spaces
    s := REGEXP_REPLACE(s, '\s+', ' ', 'g');
    s := TRIM(s);

    -- Early exit for empty
    IF s = '' THEN RETURN 'NEW'; END IF;

    -- ── DELIVERED ─────────────────────────────────────────────
    IF s IN ('livre', 'livree', 'delivered', 'livraison effectuee', 'remis') THEN
        RETURN 'DELIVERED';
    END IF;

    -- ── COMING BACK (Refused / Returned / Cancelled) ──────────
    IF s IN (
        'refuse', 'refused', 'refus',
        'retourne', 'retournee', 'returned',
        'retourne a l expediteur', 'return to sender', 'rts',
        'annule', 'annulee', 'cancelled', 'canceled', 'annulation',
        'non livre', 'non livree', 'undelivered', 'echec de livraison'
    ) THEN
        RETURN 'COMING_BACK';
    END IF;

    -- ── OUT FOR DELIVERY (exact matches) ──────────────────────
    IF s IN (
        -- French
        'mise en distribution', 'en distribution', 'distribution',
        'en cours de livraison', 'en livraison',
        'en route', 'sorti pour livraison',
        'chez le livreur', 'avec le livreur',
        'en tournee', 'tournee',
        'dernier kilometre', 'dernier km',
        'livraison programmee', 'livraison programme',
        'tentative de livraison',
        'client contacte',
        -- English
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
        'shipping',
        -- Carrier misc
        'in movement', 'en mouvement',
        'en acheminement', 'acheminement',
        'arrive agence livraison', 'arrive en agence de livraison',
        'transferred to local courier'
    ) THEN
        RETURN 'OUT_FOR_DELIVERY';
    END IF;

    -- ── READY (picked up, at agency) ──────────────────────────
    IF s IN (
        'nouveau colis', 'new parcel',
        'en attente de ramassage', 'attente de ramassage', 'attente ramassage', 'waiting for pickup',
        'ramasse', 'picked up', 'collecte', 'enleve',
        'recu en agence', 'received at agency', 'arrive en agence', 'arrivee en agence',
        'en attente', 'waiting',
        'registered', 'enregistre', 'cree'
    ) THEN
        RETURN 'READY';
    END IF;

    -- ── CONFIRMED ─────────────────────────────────────────────
    IF s IN ('confirme', 'confirmee', 'confirmed') THEN
        RETURN 'CONFIRMED';
    END IF;

    -- ── Keyword-based fallback (smart detection) ──────────────

    -- OUT_FOR_DELIVERY keywords
    IF s ~ '(livraison|distribution|tournee|livreur|dernier.?km|delivery|transit|courier|dispatch|driver|last.?mile|en.?route|on.?route)' THEN
        -- Exclude patterns that are known negatives (non livre, echec, ...)
        IF s NOT SIMILAR TO '%(non |echec|refus|retour|return|annul|cancel)%' THEN
            RETURN 'OUT_FOR_DELIVERY';
        END IF;
    END IF;

    -- DELIVERED keywords fallback
    IF s ~ '(^livre|livre$|delivered|remis)' AND s NOT SIMILAR TO '%(non |echec|tentative)%' THEN
        RETURN 'DELIVERED';
    END IF;

    -- COMING BACK keywords fallback
    IF s ~ '(retour|refuse|annul|return|cancel|rts)' THEN
        RETURN 'COMING_BACK';
    END IF;

    -- READY keywords fallback
    IF s ~ '(ramass|pickup|agence|collecte)' THEN
        RETURN 'READY';
    END IF;

    -- Default
    RETURN 'NEW';
END;
$$ LANGUAGE plpgsql IMMUTABLE;
