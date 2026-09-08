-- Migration pour supprimer la contrainte globale sur external_order_id
-- Cela permet à plusieurs workspaces de se connecter au même store YouCan
-- et d'importer les mêmes commandes.

-- Suppression de l'index et de la contrainte s'ils existent
DROP INDEX IF EXISTS public.idx_orders_external_order_id_unique;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS idx_orders_external_order_id_unique;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_external_order_id_key;

-- Vérification et création de l'index composite (déjà défini dans 20260901090000 mais on s'assure qu'il est là)
CREATE UNIQUE INDEX IF NOT EXISTS orders_source_integration_external_uidx
  ON public.orders (workspace_id, source_integration_id, external_order_id);
