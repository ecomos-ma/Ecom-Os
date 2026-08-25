-- Enable Supabase Realtime for the orders table
-- This allows the frontend to receive live updates when orders are inserted/updated/deleted
alter publication supabase_realtime add table public.orders;
