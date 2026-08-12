import { getManagedUser, sessionUser } from "../_lib/demo-auth";
import {
  createDevelopmentAction,
  getDevelopmentAction,
  listDevelopmentActions,
  updateDevelopmentAction,
  type DevelopmentActionStatus,
} from "../_lib/development-action-db";
import { apiError, cleanRequiredString, jsonResponse, readJsonObject, sameOriginMutation } from "../_lib/http";

const developerStatuses = new Set<DevelopmentActionStatus>([
  "Em análise", "Em desenvolvimento", "Aguardando validação",
]);

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

async function validDeveloper(id: string) {
  const user = await getManagedUser(id);
  return Boolean(user?.active && user.role === "desenvolvedor");
}

export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  const actions = await listDevelopmentActions(user.role === "desenvolvedor" ? user.id : undefined);
  return jsonResponse({ actions });
}

export async function POST(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  if (!(["suporte", "administrador"] as string[]).includes(user.role)) {
    return apiError(403, "Somente o Suporte pode encaminhar ações.");
  }
  if (!sameOriginMutation(request)) return apiError(403, "Origem da requisição não autorizada.");
  const body = await readJsonObject(request);
  if (!body) return apiError(422, "Revise os dados da ação.");

  const title = cleanText(body.title, 120);
  const problemDescription = cleanText(body.problemDescription, 3000);
  const actionPlan = cleanText(body.actionPlan, 3000);
  const analysisInformation = cleanText(body.analysisInformation, 3000);
  const developerId = cleanRequiredString(body.developerId);
  const identifiedAt = cleanRequiredString(body.identifiedAt);
  const identifiedTime = Date.parse(identifiedAt);
  if (title.length < 5) return apiError(422, "Informe um título com pelo menos 5 caracteres.");
  if (problemDescription.length < 10) return apiError(422, "Descreva o problema com pelo menos 10 caracteres.");
  if (actionPlan.length < 10) return apiError(422, "Informe um plano de ação com pelo menos 10 caracteres.");
  if (!Number.isFinite(identifiedTime)) return apiError(422, "Data de identificação inválida.");
  if (!(await validDeveloper(developerId))) return apiError(422, "Selecione um Desenvolvedor ativo.");

  const now = new Date().toISOString();
  const action = await createDevelopmentAction({
    title, problemDescription, actionPlan, analysisInformation,
    identifiedAt: new Date(identifiedTime).toISOString(),
    supportId: user.id, developerId, dueAt: null, status: "Encaminhada",
    developerNotes: "", resolutionNotes: "", evidencePaths: [], resolvedAt: null,
    createdAt: now, updatedAt: now,
  });
  return jsonResponse({ action }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  if (!sameOriginMutation(request)) return apiError(403, "Origem da requisição não autorizada.");
  const body = await readJsonObject(request);
  if (!body) return apiError(422, "Revise os dados da ação.");
  const id = cleanRequiredString(body.id);
  const current = id ? await getDevelopmentAction(id) : null;
  if (!current) return apiError(422, "Ação não encontrada.");
  const now = new Date().toISOString();

  if (user.role === "desenvolvedor") {
    if (current.developerId !== user.id) return apiError(403, "Esta ação não foi atribuída a você.");
    if (current.status === "Resolvida") return apiError(422, "Esta ação já foi encerrada.");
    const status = cleanRequiredString(body.status) as DevelopmentActionStatus;
    const developerNotes = cleanText(body.developerNotes, 3000);
    const dueAt = cleanRequiredString(body.dueAt);
    const dueTime = Date.parse(dueAt);
    if (!developerStatuses.has(status)) return apiError(422, "Status inválido para o Desenvolvedor.");
    if (!Number.isFinite(dueTime)) return apiError(422, "Informe a data prevista para resolução.");
    if (dueTime < Date.now() - 5 * 60_000) return apiError(422, "A previsão não pode estar no passado.");
    const action = await updateDevelopmentAction(id, {
      status, developer_notes: developerNotes,
      due_at: new Date(dueTime).toISOString(), updated_at: now,
    });
    return jsonResponse({ action });
  }

  if (!(["suporte", "administrador"] as string[]).includes(user.role)) {
    return apiError(403, "Você não tem permissão para alterar esta ação.");
  }

  const validation = cleanRequiredString(body.validation);
  if (validation === "resolved") {
    if (current.status !== "Aguardando validação") return apiError(422, "A ação ainda não foi enviada para validação.");
    const action = await updateDevelopmentAction(id, {
      status: "Resolvida", resolution_notes: cleanText(body.resolutionNotes, 3000),
      resolved_at: now, updated_at: now,
    });
    return jsonResponse({ action });
  }
  if (validation === "reopen") {
    if (current.status !== "Aguardando validação") return apiError(422, "A ação ainda não foi enviada para validação.");
    const notes = cleanText(body.resolutionNotes, 3000);
    if (notes.length < 5) return apiError(422, "Informe o motivo da reabertura.");
    const action = await updateDevelopmentAction(id, {
      status: "Em desenvolvimento", resolution_notes: notes,
      due_at: null, resolved_at: null, updated_at: now,
    });
    return jsonResponse({ action });
  }

  const developerId = cleanRequiredString(body.developerId) || current.developerId;
  if (!(await validDeveloper(developerId))) return apiError(422, "Selecione um Desenvolvedor ativo.");
  const action = await updateDevelopmentAction(id, {
    title: cleanText(body.title, 120) || current.title,
    problem_description: cleanText(body.problemDescription, 3000) || current.problemDescription,
    action_plan: cleanText(body.actionPlan, 3000) || current.actionPlan,
    analysis_information: cleanText(body.analysisInformation, 3000),
    developer_id: developerId,
    updated_at: now,
  });
  return jsonResponse({ action });
}
