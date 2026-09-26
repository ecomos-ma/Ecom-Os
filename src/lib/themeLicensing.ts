import { supabase } from "./supabase";

export type ThemeLicense = {
  id: string; label: string; domain: string; status: "active" | "disabled" | "revoked";
  created_at: string; updated_at: string; last_checked_at: string | null; revoked_at: string | null;
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("theme-domain-licensing", { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export const themeLicensing = {
  list: () => call<{ licenses: ThemeLicense[] }>({ action: "list" }),
  create: (label: string, domain: string) => call<{ license: ThemeLicense; code: string }>({ action: "create", label, domain }),
  update: (id: string, values: Partial<Pick<ThemeLicense, "label" | "domain" | "status">>) => call<{ license: ThemeLicense }>({ action: "update", id, ...values }),
  rotate: (id: string) => call<{ license: ThemeLicense; code: string }>({ action: "rotate", id }),
  setStatus: (id: string, action: "enable" | "disable" | "revoke") => call<{ license: ThemeLicense }>({ action, id }),
};
