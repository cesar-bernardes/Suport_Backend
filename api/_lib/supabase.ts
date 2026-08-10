import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient<any>> | null = null;

function runtimeValue(name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_SCHEMA") {
  const value = process.env[name];
  return value?.trim() || "";
}

export function supportDatabase() {
  const url = runtimeValue("SUPABASE_URL");
  const serviceRoleKey = runtimeValue("SUPABASE_SERVICE_ROLE_KEY");
  const schema = runtimeValue("SUPABASE_SCHEMA") || "suporte";
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase environment variables are unavailable.");
  }
  client ??= createClient<any>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client.schema(schema);
}

export function requireData<T>(result: { data: T | null; error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Supabase returned no data.");
  return result.data;
}
