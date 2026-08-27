-- ═══════════════════════════════════════════════════════════════
-- 059_products_seller_features.sql
-- Adds initial_stock, workspace_id (if missing), and storage bucket
-- for product images. Safe to run multiple times (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════

-- 1. Ensure workspace_id exists on products (may have been added earlier)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 2. Add initial_stock column (how many units the seller bought from supplier)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS initial_stock INTEGER NOT NULL DEFAULT 0;

-- 3. Ensure image_url exists (already added in 056, but safe to re-add)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 4. Ensure cost / price / low_stock_threshold exist with correct types
--    (Already in 001_initial_schema but using ADD COLUMN IF NOT EXISTS is safe)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5;

-- 5. Better RLS policy scoped to workspace — covers OWNER + MEMBERS
DROP POLICY IF EXISTS "Authenticated users can manage products" ON public.products;
DROP POLICY IF EXISTS "Workspace members can manage products" ON public.products;

CREATE POLICY "Products workspace access"
  ON public.products FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.profile_workspaces WHERE profile_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.profile_workspaces WHERE profile_id = auth.uid()
    )
  );

-- 6. Index for fast workspace lookups
CREATE INDEX IF NOT EXISTS idx_products_workspace_id ON public.products(workspace_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);

-- ═══════════════════════════════════════════════════════════════
-- STORAGE: product-images bucket
-- ═══════════════════════════════════════════════════════════════

-- Create the bucket (public so images are visible without auth)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880, -- 5 MB max per image
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop any old storage policies to avoid duplicates
DROP POLICY IF EXISTS "Public product images readable"     ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete product images" ON storage.objects;

-- Read: anyone can view product images (public bucket)
CREATE POLICY "Public product images readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- Upload: authenticated users only
CREATE POLICY "Authenticated can upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- Update / replace
CREATE POLICY "Authenticated can update product images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- Delete
CREATE POLICY "Authenticated can delete product images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');
