import { requireData, supportDatabase } from "./supabase";

export type DevelopmentActionStatus =
  | "Encaminhada"
  | "Em análise"
  | "Em desenvolvimento"
  | "Aguardando validação"
  | "Reprovada"
  | "Resolvida";
export type DevelopmentActionUrgency = "Leve" | "Médio" | "Urgente";

export type DevelopmentAction = {
  id: string;
  number: string;
  title: string;
  problemDescription: string;
  actionPlan: string;
  analysisInformation: string;
  identifiedAt: string;
  supportId: string;
  developerId: string;
  systemId: string | null;
  moduleId: string | null;
  urgency: DevelopmentActionUrgency;
  dueAt: string | null;
  status: DevelopmentActionStatus;
  developerNotes: string;
  resolutionNotes: string;
  evidencePaths: string[];
  resolvedAt: string | null;
  archivedAt: string | null;
  archivedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type ActionRow = {
  id: string; number: string; title: string; problem_description: string;
  action_plan: string; analysis_information: string; identified_at: string;
  support_id: string; developer_id: string;
  system_id: string | null; module_id: string | null; due_at: string | null;
  urgency: DevelopmentActionUrgency | null;
  status: DevelopmentActionStatus; developer_notes: string | null;
  resolution_notes: string | null; evidence_json: unknown;
  resolved_at: string | null; archived_at: string | null; archived_by: string | null;
  created_at: string; updated_at: string;
};

function toAction(row: ActionRow): DevelopmentAction {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    problemDescription: row.problem_description,
    actionPlan: row.action_plan,
    analysisInformation: row.analysis_information,
    identifiedAt: row.identified_at,
    supportId: row.support_id,
    developerId: row.developer_id,
    systemId: row.system_id,
    moduleId: row.module_id,
    urgency: row.urgency || "Médio",
    dueAt: row.due_at,
    status: row.status === "Em análise" || row.status === "Aguardando validação" ? "Em desenvolvimento" : row.status,
    developerNotes: row.developer_notes || "",
    resolutionNotes: row.resolution_notes || "",
    evidencePaths: Array.isArray(row.evidence_json)
      ? row.evidence_json.filter((item): item is string => typeof item === "string")
      : [],
    resolvedAt: row.resolved_at,
    archivedAt: row.archived_at || null,
    archivedBy: row.archived_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function archiveColumnsMissing(message: string | undefined) {
  return Boolean(message && /archived_(at|by).*does not exist|schema cache.*archived_/i.test(message));
}

export async function listDevelopmentActions(developerId?: string, archived = false) {
  let query = supportDatabase().from("development_actions").select("*")
    .is("deleted_at", null).order(archived ? "archived_at" : "identified_at", { ascending: false });
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (developerId) query = query.eq("developer_id", developerId);
  let result = await query;
  if (result.error && archiveColumnsMissing(result.error.message)) {
    if (archived) {
      throw new Error("Execute add_development_action_archive.sql no Supabase para habilitar o arquivo de ações.");
    }
    let fallback = supportDatabase().from("development_actions").select("*")
      .is("deleted_at", null).order("identified_at", { ascending: false });
    if (developerId) fallback = fallback.eq("developer_id", developerId);
    result = await fallback;
  }
  return requireData(result).map((row) => toAction(row as ActionRow));
}

export async function getDevelopmentAction(id: string, includeArchived = false) {
  let query = supportDatabase().from("development_actions").select("*")
    .eq("id", id).is("deleted_at", null);
  if (!includeArchived) query = query.is("archived_at", null);
  let result = await query.maybeSingle();
  if (result.error && !includeArchived && archiveColumnsMissing(result.error.message)) {
    result = await supportDatabase().from("development_actions").select("*")
      .eq("id", id).is("deleted_at", null).maybeSingle();
  }
  if (result.error) throw new Error(result.error.message);
  return result.data ? toAction(result.data as ActionRow) : null;
}

export async function createDevelopmentAction(input: Omit<DevelopmentAction, "id" | "number">) {
  const date = new Date(input.createdAt);
  const stamp = date.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomUUID().slice(0, 5).toUpperCase();
  const payload = {
    id: `da-${crypto.randomUUID()}`,
    number: `DEV-${stamp}-${suffix}`,
    title: input.title,
    problem_description: input.problemDescription,
    action_plan: input.actionPlan,
    analysis_information: input.analysisInformation,
    identified_at: input.identifiedAt,
    support_id: input.supportId,
    developer_id: input.developerId,
    system_id: input.systemId,
    module_id: input.moduleId,
    urgency: input.urgency,
    due_at: input.dueAt,
    status: input.status,
    developer_notes: input.developerNotes,
    resolution_notes: input.resolutionNotes,
    evidence_json: input.evidencePaths,
    resolved_at: input.resolvedAt,
    archived_at: input.archivedAt,
    archived_by: input.archivedBy,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
  };
  const result = await supportDatabase().from("development_actions")
    .insert(payload).select("*").single();
  return toAction(requireData(result) as ActionRow);
}

export async function updateDevelopmentAction(id: string, changes: Record<string, unknown>) {
  const result = await supportDatabase().from("development_actions")
    .update(changes).eq("id", id).is("deleted_at", null).select("*").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? toAction(result.data as ActionRow) : null;
}

export async function softDeleteDevelopmentAction(id: string, actorId: string) {
  const now = new Date().toISOString();
  const result = await supportDatabase().from("development_actions")
    .update({ deleted_at: now, deleted_by: actorId, updated_at: now })
    .eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return Boolean(result.data);
}
