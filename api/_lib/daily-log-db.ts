import { supportDatabase } from "./supabase";
import { ensureAgendaSchema } from "./agenda-db";

const DAILY_LOG_PREFIX = "__daily_log__";

export type DailyLogEntry = {
  id: string;
  workDate: string;
  time: string;
  activity: string;
  observations: string;
  actions: string;
  assigneeId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type DailyLogRow = {
  id: string;
  title: string;
  description: string;
  assignee_id: string;
  created_by: string;
  scheduled_start: string;
  outcome: string;
  created_at: string;
  updated_at: string;
};

function toEntry(row: DailyLogRow): DailyLogEntry {
  const date = new Date(row.scheduled_start);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    id: row.id,
    workDate: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    activity: row.title,
    observations: row.description,
    actions: row.outcome.slice(DAILY_LOG_PREFIX.length),
    assigneeId: row.assignee_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function scheduledStart(workDate: string, time: string) {
  return new Date(`${workDate}T${time}:00-04:00`).toISOString();
}

export async function listDailyLogs() {
  await ensureAgendaSchema();
  const result = await supportDatabase()
    .from("portal_agenda_entries")
    .select("*")
    .like("outcome", `${DAILY_LOG_PREFIX}%`)
    .is("deleted_at", null)
    .order("scheduled_start", { ascending: false });
  if (result.error) throw new Error(result.error.message);
  return (result.data as DailyLogRow[]).map(toEntry);
}

export async function getDailyLog(id: string) {
  await ensureAgendaSchema();
  const result = await supportDatabase()
    .from("portal_agenda_entries")
    .select("*")
    .eq("id", id)
    .like("outcome", `${DAILY_LOG_PREFIX}%`)
    .is("deleted_at", null)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? toEntry(result.data as DailyLogRow) : null;
}

export async function createDailyLog(input: Omit<DailyLogEntry, "id" | "createdAt" | "updatedAt">) {
  await ensureAgendaSchema();
  const now = new Date().toISOString();
  const start = scheduledStart(input.workDate, input.time);
  const result = await supportDatabase()
    .from("portal_agenda_entries")
    .insert({
      id: `daily-${crypto.randomUUID()}`,
      type: "interno",
      title: input.activity,
      description: input.observations,
      client_id: null,
      assignee_id: input.assigneeId,
      created_by: input.createdBy,
      scheduled_start: start,
      estimated_minutes: null,
      status: "concluido",
      actual_start: start,
      actual_end: start,
      outcome: `${DAILY_LOG_PREFIX}${input.actions}`,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (result.error) throw new Error(result.error.message);
  return toEntry(result.data as DailyLogRow);
}

export async function updateDailyLog(entry: DailyLogEntry) {
  await ensureAgendaSchema();
  const result = await supportDatabase()
    .from("portal_agenda_entries")
    .update({
      title: entry.activity,
      description: entry.observations,
      assignee_id: entry.assigneeId,
      scheduled_start: scheduledStart(entry.workDate, entry.time),
      outcome: `${DAILY_LOG_PREFIX}${entry.actions}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entry.id)
    .like("outcome", `${DAILY_LOG_PREFIX}%`)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? toEntry(result.data as DailyLogRow) : null;
}

export async function softDeleteDailyLog(id: string, actorId: string) {
  await ensureAgendaSchema();
  const now = new Date().toISOString();
  const result = await supportDatabase()
    .from("portal_agenda_entries")
    .update({ deleted_at: now, deleted_by: actorId, updated_at: now })
    .eq("id", id)
    .like("outcome", `${DAILY_LOG_PREFIX}%`)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return Boolean(result.data);
}
