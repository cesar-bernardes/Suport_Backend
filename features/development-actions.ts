import { getManagedUser, sessionUser } from "../api/_lib/demo-auth";
import {
  createDevelopmentAction,
  getDevelopmentAction,
  listDevelopmentActions,
  softDeleteDevelopmentAction,
  updateDevelopmentAction,
  type DevelopmentActionUrgency,
  type DevelopmentActionStatus,
} from "../api/_lib/development-action-db";
import { apiError, cleanRequiredString, jsonResponse, readJsonObject, sameOriginMutation } from "../api/_lib/http";
import { validSystemModule } from "../api/_lib/reference-data";
import { supportSupabase } from "../api/_lib/supabase";

const EVIDENCE_BUCKET = "development-action-evidence";
const MAX_EVIDENCE_FILES = 5;
const MAX_EVIDENCE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EVIDENCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4", "text/plain", "application/pdf"]);

function canAccessEvidence(user: { id: string; role: string }, supportId: string, developerId: string) {
  return user.role === "administrador" || user.id === supportId || user.id === developerId || user.role === "suporte";
}

function safeEvidenceName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120);
}

async function ensureEvidenceBucket() {
  const storage = supportSupabase().storage;
  const current = await storage.getBucket(EVIDENCE_BUCKET);
  if (!current.error) return;
  const created = await storage.createBucket(EVIDENCE_BUCKET, {
    public: false, fileSizeLimit: MAX_EVIDENCE_SIZE, allowedMimeTypes: [...ALLOWED_EVIDENCE_TYPES],
  });
  if (created.error && !/already exists/i.test(created.error.message)) throw new Error(created.error.message);
}

async function uploadEvidence(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  if (!sameOriginMutation(request)) return apiError(403, "Origem da requisição não autorizada.");
  const form = await request.formData().catch(() => null);
  const actionId = form?.get("actionId");
  const action = typeof actionId === "string" ? await getDevelopmentAction(actionId.trim()) : null;
  if (!action) return apiError(422, "Ação não encontrada.");
  if (!canAccessEvidence(user, action.supportId, action.developerId)) return apiError(403, "Você não pode anexar evidências nesta ação.");
  const files = form!.getAll("files").filter((item): item is File => item instanceof File);
  if (!files.length || action.evidencePaths.length + files.length > MAX_EVIDENCE_FILES) return apiError(422, "A ação pode ter no máximo 5 evidências.");
  if (files.some((file) => !ALLOWED_EVIDENCE_TYPES.has(file.type) || file.size > MAX_EVIDENCE_SIZE)) return apiError(422, "Use PNG, JPG, WEBP, MP4, PDF ou TXT de até 10 MB cada.");
  await ensureEvidenceBucket();
  const storage = supportSupabase().storage.from(EVIDENCE_BUCKET);
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const path = `${action.id}/${crypto.randomUUID()}-${safeEvidenceName(file.name) || "evidencia"}`;
      const result = await storage.upload(path, file, { contentType: file.type, upsert: false });
      if (result.error) throw new Error(result.error.message);
      uploaded.push(path);
    }
    const updated = await updateDevelopmentAction(action.id, { evidence_json: [...action.evidencePaths, ...uploaded], updated_at: new Date().toISOString() });
    return jsonResponse({ action: updated }, { status: 201 });
  } catch (error) {
    if (uploaded.length) await storage.remove(uploaded);
    return apiError(500, error instanceof Error ? error.message : "Não foi possível enviar as evidências.");
  }
}

async function getEvidence(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  const url = new URL(request.url);
  const actionId = url.searchParams.get("actionId")?.trim();
  const path = url.searchParams.get("path")?.trim();
  const action = actionId ? await getDevelopmentAction(actionId) : null;
  if (!action || !path || !canAccessEvidence(user, action.supportId, action.developerId)) return apiError(403, "Você não pode acessar esta evidência.");
  if (!action.evidencePaths.includes(path) || !path.startsWith(`${action.id}/`)) return apiError(404, "Evidência não encontrada.");
  const signed = await supportSupabase().storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 60);
  if (signed.error || !signed.data?.signedUrl) return apiError(500, "Não foi possível abrir a evidência.");
  return Response.redirect(signed.data.signedUrl, 302);
}

const developerStatuses = new Set<DevelopmentActionStatus>([
  "Em análise", "Em desenvolvimento", "Aguardando validação",
]);
const actionUrgencies = new Set<DevelopmentActionUrgency>(["Leve", "Médio", "Urgente"]);

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

async function validDeveloper(id: string) {
  const user = await getManagedUser(id);
  return Boolean(user?.active && user.role === "desenvolvedor");
}

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("evidence") === "1") {
    return getEvidence(request);
  }
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  const actions = await listDevelopmentActions(user.role === "desenvolvedor" ? user.id : undefined);
  return jsonResponse({ actions });
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    return uploadEvidence(request);
  }
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
  const developerId = cleanRequiredString(body.developerId);
  const systemId = cleanRequiredString(body.systemId);
  const moduleId = cleanRequiredString(body.moduleId);
  const urgency = cleanRequiredString(body.urgency) as DevelopmentActionUrgency;
  const identifiedAt = cleanRequiredString(body.identifiedAt);
  const identifiedTime = Date.parse(identifiedAt);
  if (title.length < 5) return apiError(422, "Informe um título com pelo menos 5 caracteres.");
  if (problemDescription.length < 10) return apiError(422, "Descreva o problema com pelo menos 10 caracteres.");
  if (!Number.isFinite(identifiedTime)) return apiError(422, "Data de identificação inválida.");
  if (!(await validDeveloper(developerId))) return apiError(422, "Selecione um Desenvolvedor ativo.");
  if (!systemId || !moduleId || !(await validSystemModule(systemId, moduleId))) {
    return apiError(422, "Selecione um Sistema e um Módulo ativos do Catálogo.");
  }
  if (!actionUrgencies.has(urgency)) return apiError(422, "Selecione uma urgência válida.");

  const now = new Date().toISOString();
  let action;
  try {
    action = await createDevelopmentAction({
      title, problemDescription, actionPlan: "", analysisInformation: "",
      identifiedAt: new Date(identifiedTime).toISOString(),
      supportId: user.id, developerId, systemId, moduleId,
      urgency, dueAt: null, status: "Encaminhada",
      developerNotes: "", resolutionNotes: "", evidencePaths: [], resolvedAt: null,
      createdAt: now, updatedAt: now,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[development-actions] failed to create action", {
      supportId: user.id,
      developerId,
      error: message,
    });
    if (/development_actions|schema cache|permission denied|relation .* does not exist/i.test(message)) {
      return apiError(
        503,
        "A tabela de Ações para Desenvolvedores ainda não está disponível no Supabase. Execute development_actions.sql e tente novamente.",
      );
    }
    throw error;
  }
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
    if (!current.dueAt) {
      return apiError(422, "O Desenvolvedor precisa definir uma previsão antes da finalização.");
    }
    const resolutionNotes = cleanText(body.resolutionNotes, 3000);
    const isEarlyClosure = new Date(current.dueAt).getTime() > Date.now();
    if (isEarlyClosure && resolutionNotes.length < 10) {
      return apiError(422, "Justifique a finalização antes do prazo com pelo menos 10 caracteres.");
    }
    const action = await updateDevelopmentAction(id, {
      status: "Resolvida", resolution_notes: resolutionNotes,
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
  const systemId = cleanRequiredString(body.systemId) || current.systemId;
  const moduleId = cleanRequiredString(body.moduleId) || current.moduleId;
  if ((systemId || moduleId) && (!systemId || !moduleId || !(await validSystemModule(systemId, moduleId)))) {
    return apiError(422, "Selecione um Sistema e um Módulo ativos do Catálogo.");
  }
  const urgency = (cleanRequiredString(body.urgency) || current.urgency) as DevelopmentActionUrgency;
  if (!actionUrgencies.has(urgency)) return apiError(422, "Selecione uma urgência válida.");
  const action = await updateDevelopmentAction(id, {
    title: cleanText(body.title, 120) || current.title,
    problem_description: cleanText(body.problemDescription, 3000) || current.problemDescription,
    action_plan: cleanText(body.actionPlan, 3000) || current.actionPlan,
    analysis_information: cleanText(body.analysisInformation, 3000),
    developer_id: developerId,
    system_id: systemId || null,
    module_id: moduleId || null,
    urgency,
    updated_at: now,
  });
  return jsonResponse({ action });
}

export async function DELETE(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  if (user.role !== "administrador") {
    return apiError(403, "Somente Administradores podem excluir ações de desenvolvimento.");
  }
  if (!sameOriginMutation(request)) {
    return apiError(403, "Origem da requisição não autorizada.");
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return apiError(422, "Ação de desenvolvimento não informada.");
  const current = await getDevelopmentAction(id);
  if (!current) return apiError(422, "Ação de desenvolvimento não encontrada.");

  const deleted = await softDeleteDevelopmentAction(id, user.id);
  if (!deleted) return apiError(422, "Não foi possível excluir a ação.");
  return jsonResponse({ deleted: true, id });
}
