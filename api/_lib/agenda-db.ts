import { env } from "cloudflare:workers";

export type AgendaType = "agendado" | "inesperado" | "interno";
export type AgendaStatus =
  | "planejado"
  | "em_andamento"
  | "concluido"
  | "cancelado";

export type AgendaEntry = {
  id: string;
  type: AgendaType;
  title: string;
  description: string;
  clientId: string | null;
  assigneeId: string;
  createdBy: string;
  scheduledStart: string | null;
  estimatedMinutes: number | null;
  status: AgendaStatus;
  actualStart: string | null;
  actualEnd: string | null;
  outcome: string | null;
  createdAt: string;
  updatedAt: string;
};

type AgendaRow = {
  id: string;
  type: AgendaType;
  title: string;
  description: string;
  client_id: string | null;
  assignee_id: string;
  created_by: string;
  scheduled_start: string | null;
  estimated_minutes: number | null;
  status: AgendaStatus;
  actual_start: string | null;
  actual_end: string | null;
  outcome: string | null;
  created_at: string;
  updated_at: string;
};

const seeds: AgendaEntry[] = [
  {
    id: "agenda-demo-1",
    type: "agendado",
    title: "Revisar falha de sincronização",
    description: "Validação conjunta com a equipe do cliente.",
    clientId: "cl2",
    assigneeId: "u1",
    createdBy: "u2",
    scheduledStart: "2026-08-07T13:30:00.000Z",
    estimatedMinutes: 60,
    status: "planejado",
    actualStart: null,
    actualEnd: null,
    outcome: null,
    createdAt: "2026-08-06T18:00:00.000Z",
    updatedAt: "2026-08-06T18:00:00.000Z",
  },
  {
    id: "agenda-demo-2",
    type: "interno",
    title: "Atualização da base de conhecimento",
    description: "Documentar o procedimento de recuperação de acesso.",
    clientId: null,
    assigneeId: "u1",
    createdBy: "u1",
    scheduledStart: "2026-08-07T15:00:00.000Z",
    estimatedMinutes: 30,
    status: "planejado",
    actualStart: null,
    actualEnd: null,
    outcome: null,
    createdAt: "2026-08-06T18:10:00.000Z",
    updatedAt: "2026-08-06T18:10:00.000Z",
  },
];

let schemaPromise: Promise<void> | null = null;

function database() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return env.DB;
}

function toEntry(row: AgendaRow): AgendaEntry {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    clientId: row.client_id,
    assigneeId: row.assignee_id,
    createdBy: row.created_by,
    scheduledStart: row.scheduled_start,
    estimatedMinutes: row.estimated_minutes,
    status: row.status,
    actualStart: row.actual_start,
    actualEnd: row.actual_end,
    outcome: row.outcome,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function initializeSchema() {
  const db = database();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS portal_agenda_entries (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('agendado', 'inesperado', 'interno')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      client_id TEXT,
      assignee_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      scheduled_start TEXT,
      estimated_minutes INTEGER,
      status TEXT NOT NULL CHECK (status IN ('planejado', 'em_andamento', 'concluido', 'cancelado')),
      actual_start TEXT,
      actual_end TEXT,
      outcome TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      deleted_by TEXT
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS portal_agenda_assignee_start_idx ON portal_agenda_entries(assignee_id, scheduled_start)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS portal_agenda_active_status_idx ON portal_agenda_entries(deleted_at, status)",
    ),
  ]);
  await db.batch(
    seeds.map((entry) =>
      db.prepare(`INSERT OR IGNORE INTO portal_agenda_entries (
        id, type, title, description, client_id, assignee_id, created_by,
        scheduled_start, estimated_minutes, status, actual_start, actual_end,
        outcome, created_at, updated_at, deleted_at, deleted_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
        .bind(
          entry.id, entry.type, entry.title, entry.description, entry.clientId,
          entry.assigneeId, entry.createdBy, entry.scheduledStart,
          entry.estimatedMinutes, entry.status, entry.actualStart, entry.actualEnd,
          entry.outcome, entry.createdAt, entry.updatedAt,
        ),
    ),
  );
}

export async function ensureAgendaSchema() {
  schemaPromise ??= initializeSchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

export async function listAgendaEntries() {
  await ensureAgendaSchema();
  const result = await database()
    .prepare("SELECT * FROM portal_agenda_entries WHERE deleted_at IS NULL ORDER BY COALESCE(scheduled_start, created_at) ASC")
    .all<AgendaRow>();
  return result.results.map(toEntry);
}

export async function getAgendaEntry(id: string) {
  await ensureAgendaSchema();
  const row = await database()
    .prepare("SELECT * FROM portal_agenda_entries WHERE id = ? AND deleted_at IS NULL LIMIT 1")
    .bind(id)
    .first<AgendaRow>();
  return row ? toEntry(row) : null;
}

export async function createAgendaEntry(input: Omit<AgendaEntry, "id">) {
  await ensureAgendaSchema();
  const entry: AgendaEntry = { ...input, id: `agenda-${crypto.randomUUID()}` };
  await database().prepare(`INSERT INTO portal_agenda_entries (
    id, type, title, description, client_id, assignee_id, created_by,
    scheduled_start, estimated_minutes, status, actual_start, actual_end,
    outcome, created_at, updated_at, deleted_at, deleted_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`)
    .bind(
      entry.id, entry.type, entry.title, entry.description, entry.clientId,
      entry.assigneeId, entry.createdBy, entry.scheduledStart,
      entry.estimatedMinutes, entry.status, entry.actualStart, entry.actualEnd,
      entry.outcome, entry.createdAt, entry.updatedAt,
    ).run();
  return entry;
}

export async function updateAgendaEntry(entry: AgendaEntry) {
  await ensureAgendaSchema();
  await database().prepare(`UPDATE portal_agenda_entries SET
    type = ?, title = ?, description = ?, client_id = ?, assignee_id = ?,
    scheduled_start = ?, estimated_minutes = ?, status = ?, actual_start = ?,
    actual_end = ?, outcome = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL`)
    .bind(
      entry.type, entry.title, entry.description, entry.clientId,
      entry.assigneeId, entry.scheduledStart, entry.estimatedMinutes,
      entry.status, entry.actualStart, entry.actualEnd, entry.outcome,
      entry.updatedAt, entry.id,
    ).run();
  return entry;
}

export async function softDeleteAgendaEntry(id: string, actorId: string) {
  await ensureAgendaSchema();
  const now = new Date().toISOString();
  const result = await database().prepare(`UPDATE portal_agenda_entries
    SET deleted_at = ?, deleted_by = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL`)
    .bind(now, actorId, now, id).run();
  return Number(result.meta.changes || 0) > 0;
}

export async function hasAgendaOverlap(entry: AgendaEntry) {
  if (!entry.scheduledStart || !entry.estimatedMinutes || entry.status === "cancelado") return false;
  const start = Date.parse(entry.scheduledStart);
  const end = start + entry.estimatedMinutes * 60_000;
  const entries = await listAgendaEntries();
  return entries.some((other) => {
    if (
      other.id === entry.id || other.assigneeId !== entry.assigneeId ||
      other.status === "cancelado" || !other.scheduledStart || !other.estimatedMinutes
    ) return false;
    const otherStart = Date.parse(other.scheduledStart);
    const otherEnd = otherStart + other.estimatedMinutes * 60_000;
    return start < otherEnd && end > otherStart;
  });
}
