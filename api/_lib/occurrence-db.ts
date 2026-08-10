import { ensureIdentitySchema } from "./demo-auth";
import { type StoredOccurrence } from "./demo-store";
import { requireData, supportDatabase } from "./supabase";

type OccurrenceRow = {
  id: string; number: string; client_id: string; system_id: string;
  module_id: string; catalog_item_id: string | null; other_error: string | null;
  description: string; severity: StoredOccurrence["severity"];
  occurred_at: string; status: StoredOccurrence["status"];
  responsible_id: string; author_id: string; attachments_json: unknown;
  created_at: string; updated_at: string;
};

function toOccurrence(row: OccurrenceRow): StoredOccurrence {
  const attachments = Array.isArray(row.attachments_json)
    ? row.attachments_json.filter((item): item is string => typeof item === "string")
    : [];
  return {
    id: row.id, number: row.number, clientId: row.client_id,
    systemId: row.system_id, moduleId: row.module_id,
    ...(row.catalog_item_id ? { catalogItemId: row.catalog_item_id } : {}),
    ...(row.other_error ? { otherError: row.other_error } : {}),
    description: row.description, severity: row.severity, occurredAt: row.occurred_at,
    status: row.status, responsibleId: row.responsible_id, authorId: row.author_id,
    attachments, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function toRow(item: StoredOccurrence) {
  return {
    id: item.id, number: item.number, client_id: item.clientId,
    system_id: item.systemId, module_id: item.moduleId,
    catalog_item_id: item.catalogItemId ?? null, other_error: item.otherError ?? null,
    description: item.description, severity: item.severity, occurred_at: item.occurredAt,
    status: item.status, responsible_id: item.responsibleId, author_id: item.authorId,
    attachments_json: item.attachments, created_at: item.createdAt, updated_at: item.updatedAt,
  };
}

export async function ensureOccurrenceSchema() {
  await ensureIdentitySchema();
}

export async function listStoredOccurrences() {
  await ensureOccurrenceSchema();
  const result = await supportDatabase().from("portal_occurrences")
    .select("*").is("deleted_at", null).order("occurred_at", { ascending: false });
  return requireData(result).map((row) => toOccurrence(row as OccurrenceRow));
}

export async function getStoredOccurrence(id: string) {
  await ensureOccurrenceSchema();
  const result = await supportDatabase().from("portal_occurrences")
    .select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? toOccurrence(result.data as OccurrenceRow) : null;
}

export async function createStoredOccurrence(input: Omit<StoredOccurrence, "id" | "number">) {
  await ensureOccurrenceSchema();
  const payload = {
    id: `o-${crypto.randomUUID()}`, client_id: input.clientId,
    system_id: input.systemId, module_id: input.moduleId,
    catalog_item_id: input.catalogItemId ?? null, other_error: input.otherError ?? null,
    description: input.description, severity: input.severity, occurred_at: input.occurredAt,
    status: input.status, responsible_id: input.responsibleId, author_id: input.authorId,
    attachments_json: input.attachments, created_at: input.createdAt, updated_at: input.updatedAt,
  };
  const result = await supportDatabase().from("portal_occurrences")
    .insert(payload).select("*").single();
  return toOccurrence(requireData(result) as OccurrenceRow);
}

export async function updateStoredOccurrence(occurrence: StoredOccurrence) {
  await ensureOccurrenceSchema();
  const result = await supportDatabase().from("portal_occurrences")
    .update({ description: occurrence.description, severity: occurrence.severity,
      status: occurrence.status, responsible_id: occurrence.responsibleId,
      attachments_json: occurrence.attachments,
      updated_at: occurrence.updatedAt })
    .eq("id", occurrence.id).is("deleted_at", null).select("*").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? toOccurrence(result.data as OccurrenceRow) : occurrence;
}

export async function softDeleteStoredOccurrence(id: string, actorId: string) {
  await ensureOccurrenceSchema();
  const now = new Date().toISOString();
  const result = await supportDatabase().from("portal_occurrences")
    .update({ deleted_at: now, deleted_by: actorId, updated_at: now })
    .eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return Boolean(result.data);
}
