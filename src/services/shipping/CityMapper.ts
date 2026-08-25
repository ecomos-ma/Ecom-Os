import { supabase } from "../../lib/supabase";

export class CityMapper {
  async resolveProviderCityId(workspaceId: string, provider: string, cityName: string): Promise<string | null> {
    if (!cityName) return null;
    const { data, error } = await supabase.from("shipping_city_mapping").select("provider_city_id").eq("workspace_id", workspaceId).eq("provider", provider).ilike("city_name", cityName).limit(1).maybeSingle();
    if (error) {
      console.error("CityMapper.resolveProviderCityId error", error);
      return null;
    }
    return data?.provider_city_id ?? null;
  }

  async upsertMapping(workspaceId: string, provider: string, cityName: string, providerCityId: string) {
    const { error } = await supabase.from("shipping_city_mapping").upsert({
      workspace_id: workspaceId,
      provider,
      city_name: cityName,
      provider_city_id: providerCityId,
    }, { onConflict: "workspace_id,provider,city_name" });
    if (error) console.error("CityMapper.upsertMapping error", error);
    return !error;
  }
}

export default CityMapper;
