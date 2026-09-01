-- FIX: Allow Super Admin to see ALL orders without workspace restriction
-- Run this in Supabase SQL Editor

-- First, check existing policies
-- Run the diagnostic query from 080_diagnose_orders.sql first

-- Drop all existing restrictive policies on orders for SELECT
DROP POLICY IF EXISTS "Users can view their own workspace orders" ON orders;
DROP POLICY IF EXISTS "Authenticated users can view orders" ON orders;
DROP POLICY IF EXISTS "Supervisors and admins can see all workspace orders" ON orders;
DROP POLICY IF EXISTS "Users can insert orders" ON orders;
DROP POLICY IF EXISTS "Users can update orders" ON orders;
DROP POLICY IF EXISTS "Users can delete orders" ON orders;

-- Create a policy that allows Super Admin to see ALL orders
CREATE POLICY "Super admins can view all orders"
ON orders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
  )
);

-- Keep workspace-specific policies for regular users
CREATE POLICY "Users can view their workspace orders"
ON orders FOR SELECT
USING (
  auth.role() = 'authenticated' AND 
  workspace_id IN (
    SELECT workspace_id FROM profiles WHERE id = auth.uid()
  )
);

-- Grant Super Admin full access
CREATE POLICY "Super admins can insert orders"
ON orders FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
  )
);

CREATE POLICY "Super admins can update orders"
ON orders FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
  )
);

CREATE POLICY "Super admins can delete orders"
ON orders FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
  )
);

-- Allow regular users to insert/update/delete their workspace orders
CREATE POLICY "Users can insert orders"
ON orders FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated' AND 
  workspace_id IN (
    SELECT workspace_id FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can update orders"
ON orders FOR UPDATE
USING (
  auth.role() = 'authenticated' AND 
  workspace_id IN (
    SELECT workspace_id FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can delete orders"
ON orders FOR DELETE
USING (
  auth.role() = 'authenticated' AND 
  workspace_id IN (
    SELECT workspace_id FROM profiles WHERE id = auth.uid()
  )
);