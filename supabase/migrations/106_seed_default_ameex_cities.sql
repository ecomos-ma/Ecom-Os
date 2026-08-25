-- Seed default Ameex city mappings for all existing workspaces
-- This ensures that new workspaces have some default cities available for selection

-- First, let's see which workspaces don't have any Ameex city mappings yet
-- We'll seed the default mappings for those workspaces

-- Default Ameex city mappings (matches the hardcoded ones in the edge function)
-- We'll insert these mappings for each workspace that doesn't have any Ameex cities yet
DO $$
DECLARE
  workspace_record RECORD;
BEGIN
  FOR workspace_record IN SELECT id FROM public.workspaces WHERE id NOT IN (SELECT DISTINCT workspace_id FROM public.ameex_city_mappings) LOOP
    INSERT INTO public.ameex_city_mappings (workspace_id, normalized_city, display_name, ameex_city_id, aliases, created_at, updated_at) VALUES
      (workspace_record.id, 'agadir', 'Agadir', 63, ARRAY['اكادير', 'أكادیر']::text[], NOW(), NOW()),
      (workspace_record.id, 'meknes', 'Meknes', 2, ARRAY['مكناس', 'meknas']::text[], NOW(), NOW()),
      (workspace_record.id, 'chefchaouen', 'Chefchaouen', 127, ARRAY['aazayeb-chefchaouen', 'aazayeb chefchaouen']::text[], NOW(), NOW()),
      (workspace_record.id, 'nador', 'Nador', 17, ARRAY['AFRA-nador', 'afra nador']::text[], NOW(), NOW()),
      (workspace_record.id, 'tan tan', 'Tan Tan', 41, ARRAY['Abteh-tantan', 'Abteh Tan Tan', 'abteh tantan', 'tantan']::text[], NOW(), NOW()),
      (workspace_record.id, 'berkane', 'Berkane', 109, ARRAY['Aïn Erreggada', 'Ain Erreggada', 'Aïn Regada', 'Ain Regada', 'Erreggada']::text[], NOW(), NOW())
    ON CONFLICT (workspace_id, normalized_city) DO NOTHING;
  END LOOP;
END $$;

-- Create a function to seed default mappings for a new workspace
CREATE OR REPLACE FUNCTION public.seed_default_ameex_cities(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.ameex_city_mappings (workspace_id, normalized_city, display_name, ameex_city_id, aliases, created_at, updated_at)
  VALUES 
    (p_workspace_id, 'agadir', 'Agadir', 63, ARRAY['اكادير', 'أكادیر']::text[], NOW(), NOW()),
    (p_workspace_id, 'meknes', 'Meknes', 2, ARRAY['مكناس', 'meknas']::text[], NOW(), NOW()),
    (p_workspace_id, 'chefchaouen', 'Chefchaouen', 127, ARRAY['aazayeb-chefchaouen', 'aazayeb chefchaouen']::text[], NOW(), NOW()),
    (p_workspace_id, 'nador', 'Nador', 17, ARRAY['AFRA-nador', 'afra nador']::text[], NOW(), NOW()),
    (p_workspace_id, 'tan tan', 'Tan Tan', 41, ARRAY['Abteh-tantan', 'Abteh Tan Tan', 'abteh tantan', 'tantan']::text[], NOW(), NOW()),
    (p_workspace_id, 'berkane', 'Berkane', 109, ARRAY['Aïn Erreggada', 'Ain Erreggada', 'Aïn Regada', 'Ain Regada', 'Erreggada']::text[], NOW(), NOW())
  ON CONFLICT (workspace_id, normalized_city) DO NOTHING;
END;
$$;

-- Create a trigger to automatically seed default mappings when a new workspace is created
-- First, check if the trigger function already exists
DROP FUNCTION IF EXISTS public.auto_seed_ameex_cities() CASCADE;

CREATE FUNCTION public.auto_seed_ameex_cities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Seed default Ameex city mappings for the new workspace
  PERFORM public.seed_default_ameex_cities(NEW.id);
  RETURN NEW;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.auto_seed_ameex_cities() TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_ameex_cities(uuid) TO authenticated;

-- Create trigger on workspaces table (if it doesn't exist)
DROP TRIGGER IF EXISTS trigger_auto_seed_ameex_cities ON public.workspaces;

CREATE TRIGGER trigger_auto_seed_ameex_cities
AFTER INSERT ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.auto_seed_ameex_cities();
