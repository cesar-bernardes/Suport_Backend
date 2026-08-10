import { requireData, supportDatabase } from "./supabase";

export type ReferenceClient = { id: string; name: string };
export type ReferenceModule = { id: string; name: string; isGeneral: boolean };
export type ReferenceSystem = { id: string; name: string; modules: ReferenceModule[] };

export async function listReferenceData() {
  const db = supportDatabase();
  const [clientsResult, systemsResult, modulesResult] = await Promise.all([
    db.from("clients").select("id,name").eq("active", true).is("deleted_at", null).order("name"),
    db.from("systems").select("id,name").eq("active", true).is("deleted_at", null).order("name"),
    db.from("modules").select("id,system_id,name,is_general").eq("active", true).is("deleted_at", null).order("name"),
  ]);
  const clients = requireData(clientsResult) as Array<{ id: string; name: string }>;
  const systemRows = requireData(systemsResult) as Array<{ id: string; name: string }>;
  const moduleRows = requireData(modulesResult) as Array<{
    id: string; system_id: string; name: string; is_general: boolean;
  }>;
  const systems: ReferenceSystem[] = systemRows.map((system) => ({
    ...system,
    modules: moduleRows
      .filter((module) => module.system_id === system.id)
      .map((module) => ({ id: module.id, name: module.name, isGeneral: module.is_general })),
  }));
  return { clients: clients as ReferenceClient[], systems };
}

export async function validClient(clientId: string) {
  const result = await supportDatabase().from("clients").select("id")
    .eq("id", clientId).eq("active", true).is("deleted_at", null).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return Boolean(result.data);
}

export async function validSystemModule(systemId: string, moduleId: string) {
  const result = await supportDatabase().from("modules").select("id")
    .eq("id", moduleId).eq("system_id", systemId).eq("active", true)
    .is("deleted_at", null).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return Boolean(result.data);
}

export async function catalogMatchesReference(
  item: { systemId: string; moduleId: string },
  systemId: string,
  moduleId: string,
) {
  if (item.systemId !== systemId) return false;
  if (item.moduleId === moduleId) return true;
  const result = await supportDatabase().from("modules").select("is_general")
    .eq("id", item.moduleId).eq("system_id", systemId).eq("active", true)
    .is("deleted_at", null).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data?.is_general === true;
}
