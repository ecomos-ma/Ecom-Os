-- Add show_shipping_column to workspaces table
-- Controls visibility of Shipping column in Orders table view
ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS show_shipping_column BOOLEAN DEFAULT FALSE;
