-- ============================================================
-- DIAGNOSTIC: ORDERS TABLE TRIGGERS
-- READ-ONLY QUERIES - NO MODIFICATIONS
-- ============================================================

-- 1. LIST ALL TRIGGERS ON ORDERS TABLE
SELECT tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger 
WHERE tgrelid = '"orders"'::regclass AND NOT tgisinternal;

-- 2. GET TRIGGER FUNCTION DEFINITIONS (for each trigger)
SELECT pg_get_functiondef(p.oid) 
FROM pg_proc p 
JOIN pg_trigger t ON t.tgfoid = p.oid 
WHERE t.tgrelid = '"orders"'::regclass AND NOT t.tgisinternal;
