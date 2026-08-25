-- Restore the normalize_status function if it was accidentally removed or not applied
DROP FUNCTION IF EXISTS public.normalize_status(TEXT);

CREATE OR REPLACE FUNCTION public.normalize_status(raw_status TEXT)
RETURNS TEXT AS $$
DECLARE
    normalized TEXT := LOWER(TRIM(raw_status));
BEGIN
    IF normalized IS NULL OR normalized = '' THEN
        RETURN 'NEW';
    END IF;

    -- DELIVERED
    IF normalized IN ('livré', 'livre', 'delivered') THEN
        RETURN 'DELIVERED';
    END IF;

    -- COMING BACK
    IF normalized IN ('retourné', 'retourne', 'refusé', 'refuse', 'annulé', 'annule', 'returned', 'refused', 'cancelled', 'canceled') THEN
        RETURN 'COMING_BACK';
    END IF;

    -- CONFIRMED
    IF normalized IN ('confirmé', 'confirme', 'confirmed') THEN
        RETURN 'CONFIRMED';
    END IF;

    -- OUT FOR DELIVERY
    IF normalized IN (
        'nouveau colis', 'attente de ramassage', 'ramassé', 'ramasse', 'reçu en agence', 'recu en agence', 
        'expédié', 'expedie', 'mise en distribution', 'en cours de livraison', 
        'reporté', 'reporte', 'pas de réponse', 'pas de reponse', 'injoignable', 'occupé', 'occupe',
        'new parcel', 'waiting for pickup', 'picked up', 'received at agency', 
        'shipped', 'in distribution', 'out for delivery', 
        'postponed', 'no answer', 'unreachable', 'busy'
    ) THEN
        RETURN 'OUT_FOR_DELIVERY';
    END IF;

    RETURN 'NEW';
END;
$$ LANGUAGE plpgsql;
