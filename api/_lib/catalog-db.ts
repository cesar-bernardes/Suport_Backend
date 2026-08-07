import type { StoredCatalogItem } from "./demo-store";
import { supportDatabase } from "./supabase";

type CatalogRow = {
  id: string; system_id: string; module_id: string; name: string;
  normalized_name: string; aliases: string[]; active: boolean;
  created_at: string; updated_at: string;
};
function toItem(row: CatalogRow): StoredCatalogItem {
  return { id: row.id, systemId: row.system_id, moduleId: row.module_id,
    name: row.name, normalizedName: row.normalized_name, aliases: row.aliases || [],
    active: row.active, createdAt: row.created_at, updatedAt: row.updated_at };
}
export async function listStoredCatalogItems() {
  const result = await supportDatabase().from("catalog_items").select("*").is("deleted_at", null).order("name");
  if (result.error) throw new Error(result.error.message);
  return (result.data as CatalogRow[]).map(toItem);
}
export async function getStoredCatalogItem(id: string) {
  const result = await supportDatabase().from("catalog_items").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? toItem(result.data as CatalogRow) : null;
}
export async function findStoredCatalogDuplicate(systemId: string, moduleId: string, normalizedName: string, ignoredId?: string) {
  let query = supportDatabase().from("catalog_items").select("*").eq("system_id", systemId).eq("module_id", moduleId).eq("normalized_name", normalizedName).is("deleted_at", null);
  if (ignoredId) query = query.neq("id", ignoredId);
  const result = await query.maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? toItem(result.data as CatalogRow) : null;
}
export async function createStoredCatalogItem(item: StoredCatalogItem) {
  const result = await supportDatabase().from("catalog_items").insert({
    id: item.id, system_id: item.systemId, module_id: item.moduleId,
    name: item.name, normalized_name: item.normalizedName, aliases: item.aliases,
    active: item.active, created_at: item.createdAt, updated_at: item.updatedAt,
  }).select("*").single();
  if (result.error) throw new Error(result.error.message);
  return toItem(result.data as CatalogRow);
}
export async function updateStoredCatalogItem(item: StoredCatalogItem) {
  const result = await supportDatabase().from("catalog_items").update({
    system_id: item.systemId, module_id: item.moduleId, name: item.name,
    normalized_name: item.normalizedName, aliases: item.aliases,
    active: item.active, updated_at: item.updatedAt,
  }).eq("id", item.id).is("deleted_at", null).select("*").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? toItem(result.data as CatalogRow) : null;
}
