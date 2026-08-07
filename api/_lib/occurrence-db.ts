import { env } from "cloudflare:workers";

import {
  INITIAL_STORED_OCCURRENCES,
  type StoredOccurrence,
} from "./demo-store";

type OccurrenceRow = {
  id: string;
  number: string;
  client_id: string;
  system_id: string;
  module_id: string;
  catalog_item_id: string | null;
  other_error: string | null;
  description: string;
  severity: StoredOccurrence["severity"];
  occurred_at: string;
  status: StoredOccurrence["status"];
  responsible_id: string;
  author_id: string;
  attachments_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

let schemaPromise: Promise<void> | null = null;

function database() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return env.DB;
}

function toOccurrence(row: OccurrenceRow): StoredOccurrence {
  let attachments: string[] = [];
  try {
    const parsed = JSON.parse(row.attachments_json);
    if (Array.isArray(parsed)) attachments = parsed.filter((item) => typeof item === "string");
  } catch {
    attachments = [];
  }
  return {
    id: row.id,
    number: row.number,
    clientId: row.client_id,
    systemId: row.system_id,
    moduleId: row.module_id,
    ...(row.catalog_item_id ? { catalogItemId: row.catalog_item_id } : {}),
    ...(row.other_error ? { otherError: row.other_error } : {}),
    description: row.description,
    severity: row.severity,
    occurredAt: row.occurred_at,
    status: row.status,
    responsibleId: row.responsible_id,
    authorId: row.author_id,
    attachments,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function initializeSchema() {
  const db = database();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS portal_occurrences (
      id TEXT PRIMARY KEY NOT NULL,
      number TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL,
      system_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      catalog_item_id TEXT,
      other_error TEXT,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      status TEXT NOT NULL,
      responsible_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      deleted_by TEXT
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS portal_occurrences_active_updated_idx ON portal_occurrences(deleted_at, updated_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS portal_occurrences_responsible_idx ON portal_occurrences(responsible_id)",
    ),
  ]);

  await db.batch(
    INITIAL_STORED_OCCURRENCES.map((item) =>
      db.prepare(`INSERT OR IGNORE INTO portal_occurrences (
        id, number, client_id, system_id, module_id, catalog_item_id,
        other_error, description, severity, occurred_at, status,
        responsible_id, author_id, attachments_json, created_at, updated_at,
        deleted_at, deleted_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
        .bind(
          item.id,
          item.number,
          item.clientId,
          item.systemId,
          item.moduleId,
          item.catalogItemId ?? null,
          item.otherError ?? null,
          item.description,
          item.severity,
          item.occurredAt,
          item.status,
          item.responsibleId,
          item.authorId,
          JSON.stringify(item.attachments),
          item.createdAt,
          item.updatedAt,
        ),
    ),
  );
}

export async function ensureOccurrenceSchema() {
  schemaPromise ??= initializeSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

export async function listStoredOccurrences() {
  await ensureOccurrenceSchema();
  const result = await database()
    .prepare(
      "SELECT * FROM portal_occurrences WHERE deleted_at IS NULL ORDER BY occurred_at DESC",
    )
    .all<OccurrenceRow>();
  return result.results.map(toOccurrence);
}

export async function getStoredOccurrence(id: string) {
  await ensureOccurrenceSchema();
  const row = await database()
    .prepare(
      "SELECT * FROM portal_occurrences WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    )
    .bind(id)
    .first<OccurrenceRow>();
  return row ? toOccurrence(row) : null;
}

export async function createStoredOccurrence(
  input: Omit<StoredOccurrence, "id" | "number">,
) {
  await ensureOccurrenceSchema();
  const sequence = await database()
    .prepare(
      "SELECT COALESCE(MAX(CAST(SUBSTR(number, 5) AS INTEGER)), 2418) AS value FROM portal_occurrences",
    )
    .first<{ value: number }>();
  const occurrence: StoredOccurrence = {
    ...input,
    id: `o-${crypto.randomUUID()}`,
    number: `OCO-${Number(sequence?.value || 2418) + 1}`,
  };
  await database()
    .prepare(`INSERT INTO portal_occurrences (
      id, number, client_id, system_id, module_id, catalog_item_id,
      other_error, description, severity, occurred_at, status,
      responsible_id, author_id, attachments_json, created_at, updated_at,
      deleted_at, deleted_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
    .bind(
      occurrence.id,
      occurrence.number,
      occurrence.clientId,
      occurrence.systemId,
      occurrence.moduleId,
      occurrence.catalogItemId ?? null,
      occurrence.otherError ?? null,
      occurrence.description,
      occurrence.severity,
      occurrence.occurredAt,
      occurrence.status,
      occurrence.responsibleId,
      occurrence.authorId,
      JSON.stringify(occurrence.attachments),
      occurrence.createdAt,
      occurrence.updatedAt,
    )
    .run();
  return occurrence;
}

export async function updateStoredOccurrence(occurrence: StoredOccurrence) {
  await ensureOccurrenceSchema();
  await database()
    .prepare(`UPDATE portal_occurrences SET
      description = ?, severity = ?, status = ?, responsible_id = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`)
    .bind(
      occurrence.description,
      occurrence.severity,
      occurrence.status,
      occurrence.responsibleId,
      occurrence.updatedAt,
      occurrence.id,
    )
    .run();
  return occurrence;
}

export async function softDeleteStoredOccurrence(id: string, actorId: string) {
  await ensureOccurrenceSchema();
  const deletedAt = new Date().toISOString();
  const result = await database()
    .prepare(`UPDATE portal_occurrences
      SET deleted_at = ?, deleted_by = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`)
    .bind(deletedAt, actorId, deletedAt, id)
    .run();
  return Number(result.meta.changes || 0) > 0;
}
