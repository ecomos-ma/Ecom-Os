-- ============================================================
-- GOOGLE SHEETS FIELD MAPPING AND CUSTOM STATUS MAPPINGS
-- ============================================================
-- This migration adds mapping storage to the existing google_sheets_credentials table
-- Preserves backward compatibility - existing integrations continue to work

-- Add field mappings column (JSONB format)
ALTER TABLE public.google_sheets_credentials 
ADD COLUMN IF NOT EXISTS field_mappings JSONB DEFAULT '[]'::jsonb;

-- Add custom status value mappings column (JSONB format)
ALTER TABLE public.google_sheets_credentials 
ADD COLUMN IF NOT EXISTS custom_status_mappings JSONB DEFAULT '{}'::jsonb;

-- Add mapping version to track schema changes
ALTER TABLE public.google_sheets_credentials 
ADD COLUMN IF NOT EXISTS mapping_version INTEGER DEFAULT 1;

-- Create index for efficient querying of workspaces with mappings
CREATE INDEX IF NOT EXISTS google_sheets_credentials_has_mappings_idx 
  ON public.google_sheets_credentials(workspace_id) 
  WHERE field_mappings IS NOT NULL AND jsonb_array_length(field_mappings) > 0;

-- Add comment documenting the new columns
COMMENT ON COLUMN public.google_sheets_credentials.field_mappings IS 
'Stores field mappings from Google Sheet columns to Ecom OS order fields. Format: [{"sheetHeader": "Customer", "destinationField": "customer_name", "confidence": "matched"}]';

COMMENT ON COLUMN public.google_sheets_credentials.custom_status_mappings IS 
'Stores custom status value mappings for Google Sheets. Format: {"confirmation": {"CONFIRME": "confirmed", "client réfléchit": "no_answer"}, "shipping": {"LIVRE": "delivered", "attente livreur": "awaiting_pickup"}}';

COMMENT ON COLUMN public.google_sheets_credentials.mapping_version IS 
'Ve srsion of the mapping schema. Increment when breaking changes are made to mapping format.';