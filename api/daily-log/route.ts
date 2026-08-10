import { sessionUser, validManagedUserId } from "../_lib/demo-auth";
import {
  createDailyLog, getDailyLog, listDailyLogs, softDeleteDailyLog, updateDailyLog,
  type DailyLogEntry,
} from "../_lib/daily-log-db";
import { apiError, cleanRequiredString, jsonResponse, readJsonObject, sameOriginMutation } from "../_lib/http";

function canAccess(user: { id: string; role: string }, entry: DailyLogEntry) {
  return user.role !== "suporte" || entry.assigneeId === user.id;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00-04:00`));
}

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function fields(body: Record<string, unknown>) {
  return {
    workDate: cleanRequiredString(body.workDate),
    time: cleanRequiredString(body.time),
    activity: cleanRequiredString(body.activity).replace(/\s+/g, " "),
    observations: typeof body.observations === "string" ? body.observations.trim() : "",
    actions: typeof body.actions === "string" ? body.actions.trim() : "",
    assigneeId: cleanRequiredString(body.assigneeId),
  };
}

function validate(input: ReturnType<typeof fields>) {
  if (!validDate(input.workDate) || !validTime(input.time)) return "Informe uma data e um horÃ¡rio vÃ¡lidos.";
  if (input.activity.length < 3 || input.activity.length > 160) return "A atividade deve ter entre 3 e 160 caracteres.";
  if (input.observations.length > 1500 || input.actions.length > 1500) return "ObservaÃ§Ãµes e aÃ§Ãµes devem ter no mÃ¡ximo 1.500 caracteres.";
  return null;
}

export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "SessÃ£o invÃ¡lida ou expirada.");
  const entries = (await listDailyLogs()).filter((entry) => canAccess(user, entry));
  return jsonResponse({ entries });
}

export async function POST(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "SessÃ£o invÃ¡lida ou expirada.");
  if (!sameOriginMutation(request)) return apiError(403, "Origem da requisiÃ§Ã£o nÃ£o autorizada.");
  const body = await readJsonObject(request);
  if (!body) return apiError(422, "Revise os dados da atividade.");
  const input = fields(body);
  input.assigneeId ||= user.id;
  const issue = validate(input);
  if (issue) return apiError(422, issue);
  if (!(await validManagedUserId(input.assigneeId))) return apiError(422, "ResponsÃ¡vel invÃ¡lido.");
  if (user.role === "suporte" && input.assigneeId !== user.id) return apiError(403, "VocÃª sÃ³ pode preencher seu prÃ³prio diÃ¡rio.");
  const entry = await createDailyLog({ ...input, createdBy: user.id });
  return jsonResponse({ entry }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "SessÃ£o invÃ¡lida ou expirada.");
  if (!sameOriginMutation(request)) return apiError(403, "Origem da requisiÃ§Ã£o nÃ£o autorizada.");
  const body = await readJsonObject(request);
  if (!body) return apiError(422, "Revise os dados da atividade.");
  const id = cleanRequiredString(body.id);
  const current = id ? await getDailyLog(id) : null;
  if (!current) return apiError(404, "Atividade nÃ£o encontrada.");
  if (!canAccess(user, current)) return apiError(403, "VocÃª nÃ£o pode alterar esta atividade.");
  const input = fields(body);
  const issue = validate(input);
  if (issue) return apiError(422, issue);
  if (!(await validManagedUserId(input.assigneeId))) return apiError(422, "ResponsÃ¡vel invÃ¡lido.");
  if (user.role === "suporte" && input.assigneeId !== user.id) return apiError(403, "VocÃª nÃ£o pode reatribuir esta atividade.");
  const entry = await updateDailyLog({ ...current, ...input });
  return entry ? jsonResponse({ entry }) : apiError(404, "Atividade nÃ£o encontrada.");
}

export async function DELETE(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "SessÃ£o invÃ¡lida ou expirada.");
  if (user.role !== "administrador") return apiError(403, "Somente Administradores podem remover registros do diÃ¡rio.");
  if (!sameOriginMutation(request)) return apiError(403, "Origem da requisiÃ§Ã£o nÃ£o autorizada.");
  const id = new URL(request.url).searchParams.get("id")?.trim() || "";
  if (!id || !(await getDailyLog(id))) return apiError(404, "Atividade nÃ£o encontrada.");
  if (!(await softDeleteDailyLog(id, user.id))) return apiError(422, "NÃ£o foi possÃ­vel remover a atividade.");
  return jsonResponse({ deleted: true, id });
}
