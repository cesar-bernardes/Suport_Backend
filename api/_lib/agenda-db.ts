import { ensureIdentitySchema } from "./demo-auth";
import { requireData, supportDatabase } from "./supabase";
import { ensureReferenceData } from "./reference-data";

export type AgendaType = "agendado" | "inesperado" | "interno";
export type AgendaStatus = "planejado" | "em_andamento" | "concluido" | "cancelado";
export type AgendaEntry = {
  id: string; type: AgendaType; title: string; description: string;
  clientId: string | null; assigneeId: string; createdBy: string;
  scheduledStart: string | null; estimatedMinutes: number | null;
  status: AgendaStatus; actualStart: string | null; actualEnd: string | null;
  outcome: string | null; createdAt: string; updatedAt: string;
};

type AgendaRow = {
  id: string; type: AgendaType; title: string; description: string;
  client_id: string | null; assignee_id: string; created_by: string;
  scheduled_start: string | null; estimated_minutes: number | null;
  status: AgendaStatus; actual_start: string | null; actual_end: string | null;
  outcome: string | null; created_at: string; updated_at: string;
};

const seeds: AgendaEntry[] = [
  { id: "agenda-demo-1", type: "agendado", title: "Revisar falha de sincronizaÃ§Ã£o",
    description: "ValidaÃ§Ã£o conjunta com a equipe do cliente.", clientId: "cl2",
    assigneeId: "u1", createdBy: "u2", scheduledStart: "2026-08-07T13:30:00.000Z",
    estimatedMinutes: 60, status: "planejado", actualStart: null, actualEnd: null,
    outcome: null, createdAt: "2026-08-06T18:00:00.000Z", updatedAt: "2026-08-06T18:00:00.000Z" },
  { id: "agenda-demo-2", type: "interno", title: "AtualizaÃ§Ã£o da base de conhecimento",
    description: "Documentar o procedimento de recuperaÃ§Ã£o de acesso.", clientId: null,
    assigneeId: "u1", createdBy: "u1", scheduledStart: "2026-08-07T15:00:00.000Z",
    estimatedMinutes: 30, status: "planejado", actualStart: null, actualEnd: null,
    outcome: null, createdAt: "2026-08-06T18:10:00.000Z", updatedAt: "2026-08-06T18:10:00.000Z" },
];
const DAILY_LOG_PREFIX = "__daily_log__";

let schemaPromise: Promise<void> | null = null;
function toEntry(row: AgendaRow): AgendaEntry {
  return { id: row.id, type: row.type, title: row.title, description: row.description,
    clientId: row.client_id, assigneeId: row.assignee_id, createdBy: row.created_by,
    scheduledStart: row.scheduled_start, estimatedMinutes: row.estimated_minutes,
    status: row.status, actualStart: row.actual_start, actualEnd: row.actual_end,
    outcome: row.outcome, createdAt: row.created_at, updatedAt: row.updated_at };
}
function toRow(entry: AgendaEntry) {
  return { id: entry.id, type: entry.type, title: entry.title, description: entry.description,
    client_id: entry.clientId, assignee_id: entry.assigneeId, created_by: entry.createdBy,
    scheduled_start: entry.scheduledStart, estimated_minutes: entry.estimatedMinutes,
    status: entry.status, actual_start: entry.actualStart, actual_end: entry.actualEnd,
    outcome: entry.outcome, created_at: entry.createdAt, updated_at: entry.updatedAt };
}
async function initializeSchema() {
  await ensureIdentitySchema();
  await ensureReferenceData();
  const { error } = await supportDatabase().from("portal_agenda_entries")
    .upsert(seeds.map(toRow), { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}
export async function ensureAgendaSchema() {
  schemaPromise ??= initializeSchema().catch((error) => { schemaPromise = null; throw error; });
  return schemaPromise;
}
export async function listAgendaEntries() {
  await ensureAgendaSchema();
  const result = await supportDatabase().from("portal_agenda_entries")
    .select("*").is("deleted_at", null).order("scheduled_start", { ascending: true, nullsFirst: false });
  return requireData(result).map((row) => toEntry(row as AgendaRow))
    .filter((entry) => !entry.outcome?.startsWith(DAILY_LOG_PREFIX));
}
export async function getAgendaEntry(id: string) {
  await ensureAgendaSchema();
  const result = await supportDatabase().from("portal_agenda_entries")
    .select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) return null;
  const entry = toEntry(result.data as AgendaRow);
  return entry.outcome?.startsWith(DAILY_LOG_PREFIX) ? null : entry;
}
export async function createAgendaEntry(input: Omit<AgendaEntry, "id">) {
  await ensureAgendaSchema();
  const entry: AgendaEntry = { ...input, id: `agenda-${crypto.randomUUID()}` };
  const result = await supportDatabase().from("portal_agenda_entries")
    .insert(toRow(entry)).select("*").single();
  return toEntry(requireData(result) as AgendaRow);
}
export async function updateAgendaEntry(entry: AgendaEntry) {
  await ensureAgendaSchema();
  const row = toRow(entry); const { id, ...changes } = row;
  const result = await supportDatabase().from("portal_agenda_entries")
    .update(changes).eq("id", id).is("deleted_at", null).select("*").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? toEntry(result.data as AgendaRow) : entry;
}
export async function softDeleteAgendaEntry(id: string, actorId: string) {
  await ensureAgendaSchema(); const now = new Date().toISOString();
  const result = await supportDatabase().from("portal_agenda_entries")
    .update({ deleted_at: now, deleted_by: actorId, updated_at: now })
    .eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return Boolean(result.data);
}
export async function hasAgendaOverlap(entry: AgendaEntry) {
  if (!entry.scheduledStart || !entry.estimatedMinutes || entry.status === "cancelado") return false;
  const start = Date.parse(entry.scheduledStart); const end = start + entry.estimatedMinutes * 60_000;
  return (await listAgendaEntries()).some((other) => {
    if (other.id === entry.id || other.assigneeId !== entry.assigneeId || other.status === "cancelado" || !other.scheduledStart || !other.estimatedMinutes) return false;
    const otherStart = Date.parse(other.scheduledStart);
    return start < otherStart + other.estimatedMinutes * 60_000 && end > otherStart;
  });
}
