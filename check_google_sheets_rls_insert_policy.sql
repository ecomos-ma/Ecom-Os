-- ============================================================
-- CHECK INSERT POLICY ON google_sheets_credentials TABLE
-- ============================================================

SELECT policyname, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'google_sheets_credentials' AND cmd = 'INSERT';
