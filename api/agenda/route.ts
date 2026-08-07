import { canManageAnyOccurrence, sessionUser, validManagedUserId } from "../_lib/demo-auth";
import { validClient } from "../_lib/demo-store";
import {
  createAgendaEntry, getAgendaEntry, hasAgendaOverlap, listAgendaEntries,
  softDeleteAgendaEntry, updateAgendaEntry,
  type AgendaEntry, type AgendaStatus, type AgendaType,
} from "../_lib/agenda-db";
import { apiError, cleanRequiredString, jsonResponse, readJsonObject, sameOriginMutation } from "../_lib/http";

const TYPES = new Set<AgendaType>(["agendado", "inesperado", "interno"]);
const STATUSES = new Set<AgendaStatus>(["planejado", "em_andamento", "concluido", "cancelado"]);
const ESTIMATES = new Set([30, 60, 120, 180]);

function canAccess(user: { id: string; role: string }, entry: AgendaEntry) {
  return user.role !== "suporte" || entry.assigneeId === user.id;
}

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

function optionalEstimate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return ESTIMATES.has(number) ? number : undefined;
}

export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  const entries = (await listAgendaEntries()).filter((entry) => canAccess(user, entry));
  return jsonResponse({ entries });
}

export async function POST(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  if (!sameOriginMutation(request)) return apiError(403, "Origem da requisição não autorizada.");
  const body = await readJsonObject(request);
  if (!body) return apiError(422, "Revise os dados da agenda.");

  const type = cleanRequiredString(body.type) as AgendaType;
  const title = cleanRequiredString(body.title).replace(/\s+/g, " ");
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const clientId = body.clientId ? cleanRequiredString(body.clientId) : null;
  const assigneeId = cleanRequiredString(body.assigneeId) || user.id;
  const scheduledStart = optionalDate(body.scheduledStart);
  const estimatedMinutes = optionalEstimate(body.estimatedMinutes);
  const recordCompleted = body.recordCompleted === true;
  const recordedMinutes = Number(body.recordedMinutes);

  if (!TYPES.has(type) || title.length < 3 || title.length > 120) return apiError(422, "Informe o tipo e um título válido.");
  if (description.length > 1000) return apiError(422, "A descrição deve ter no máximo 1.000 caracteres.");
  if (scheduledStart === undefined) return apiError(422, "Data e horário inválidos.");
  if (estimatedMinutes === undefined) return apiError(422, "Estimativa inválida.");
  if (type !== "interno" && (!clientId || !validClient(clientId))) return apiError(422, "Selecione um cliente válido.");
  if (!(await validManagedUserId(assigneeId))) return apiError(422, "Responsável inválido.");
  if (user.role === "suporte" && assigneeId !== user.id) return apiError(403, "Você só pode preencher sua própria agenda.");
  if (recordCompleted && (!Number.isFinite(recordedMinutes) || recordedMinutes < 1 || recordedMinutes > 720)) return apiError(422, "Informe o tempo realizado entre 1 e 720 minutos.");

  const now = new Date();
  const actualEnd = recordCompleted ? now.toISOString() : null;
  const actualStart = recordCompleted ? new Date(now.getTime() - recordedMinutes * 60_000).toISOString() : null;
  const entry = await createAgendaEntry({
    type, title, description, clientId: type === "interno" ? null : clientId,
    assigneeId, createdBy: user.id, scheduledStart, estimatedMinutes,
    status: recordCompleted ? "concluido" : "planejado", actualStart, actualEnd,
    outcome: recordCompleted && typeof body.outcome === "string" ? body.outcome.trim().slice(0, 1000) || null : null,
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  });
  return jsonResponse({ entry, overlap: await hasAgendaOverlap(entry) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  if (!sameOriginMutation(request)) return apiError(403, "Origem da requisição não autorizada.");
  const body = await readJsonObject(request);
  if (!body) return apiError(422, "Revise os dados da agenda.");
  const id = cleanRequiredString(body.id);
  const current = id ? await getAgendaEntry(id) : null;
  if (!current) return apiError(422, "Compromisso não encontrado.");
  if (!canAccess(user, current)) return apiError(403, "Você não pode alterar este compromisso.");

  const action = cleanRequiredString(body.action);
  const now = new Date().toISOString();
  let entry: AgendaEntry = { ...current, updatedAt: now };
  if (action === "start") {
    if (current.status !== "planejado") return apiError(422, "Somente itens planejados podem ser iniciados.");
    entry = { ...entry, status: "em_andamento", actualStart: now, actualEnd: null };
  } else if (action === "finish") {
    if (current.status !== "em_andamento") return apiError(422, "Inicie a atividade antes de finalizá-la.");
    entry = { ...entry, status: "concluido", actualEnd: now, outcome: typeof body.outcome === "string" ? body.outcome.trim().slice(0, 1000) || null : null };
  } else {
    const type = Object.hasOwn(body, "type") ? cleanRequiredString(body.type) as AgendaType : current.type;
    const status = Object.hasOwn(body, "status") ? cleanRequiredString(body.status) as AgendaStatus : current.status;
    const title = Object.hasOwn(body, "title") ? cleanRequiredString(body.title).replace(/\s+/g, " ") : current.title;
    const description = Object.hasOwn(body, "description") && typeof body.description === "string" ? body.description.trim() : current.description;
    const clientId = Object.hasOwn(body, "clientId") ? cleanRequiredString(body.clientId) || null : current.clientId;
    const assigneeId = Object.hasOwn(body, "assigneeId") ? cleanRequiredString(body.assigneeId) : current.assigneeId;
    const scheduledStart = Object.hasOwn(body, "scheduledStart") ? optionalDate(body.scheduledStart) : current.scheduledStart;
    const estimatedMinutes = Object.hasOwn(body, "estimatedMinutes") ? optionalEstimate(body.estimatedMinutes) : current.estimatedMinutes;
    if (!TYPES.has(type) || !STATUSES.has(status) || title.length < 3 || title.length > 120 || description.length > 1000) return apiError(422, "Revise os campos informados.");
    if (scheduledStart === undefined || estimatedMinutes === undefined) return apiError(422, "Data ou estimativa inválida.");
    if (type !== "interno" && (!clientId || !validClient(clientId))) return apiError(422, "Selecione um cliente válido.");
    if (!(await validManagedUserId(assigneeId))) return apiError(422, "Responsável inválido.");
    if (user.role === "suporte" && assigneeId !== user.id) return apiError(403, "Você não pode reatribuir este compromisso.");
    entry = { ...entry, type, status, title, description, clientId: type === "interno" ? null : clientId, assigneeId, scheduledStart, estimatedMinutes };
  }
  await updateAgendaEntry(entry);
  return jsonResponse({ entry, overlap: await hasAgendaOverlap(entry) });
}

export async function DELETE(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  if (user.role !== "administrador") return apiError(403, "Somente Administradores podem remover itens da agenda.");
  if (!sameOriginMutation(request)) return apiError(403, "Origem da requisição não autorizada.");
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id || !(await getAgendaEntry(id))) return apiError(422, "Compromisso não encontrado.");
  if (!(await softDeleteAgendaEntry(id, user.id))) return apiError(422, "Não foi possível remover o compromisso.");
  return jsonResponse({ deleted: true, id });
}
