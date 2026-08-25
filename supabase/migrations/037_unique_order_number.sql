-- Add UNIQUE constraint on orders.order_number
-- This prevents future duplicate order_number collisions from Google Sheets imports

ALTER TABLE orders
ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
