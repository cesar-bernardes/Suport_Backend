import {
  canManageAnyOccurrence,
  sessionUser,
  validManagedUserId,
} from "../_lib/demo-auth";
import {
  OCCURRENCE_STATUSES,
  SEVERITIES,
  type DemoOccurrenceStatus,
  type DemoSeverity,
  type StoredOccurrence,
} from "../_lib/demo-store";
import {
  catalogMatchesReference,
  validClient,
  validSystemModule,
} from "../_lib/reference-data";
import { getStoredCatalogItem } from "../_lib/catalog-db";
import {
  createStoredOccurrence,
  getStoredOccurrence,
  listStoredOccurrences,
  softDeleteStoredOccurrence,
  updateStoredOccurrence,
} from "../_lib/occurrence-db";
import {
  apiError,
  cleanRequiredString,
  jsonResponse,
  readJsonObject,
  sameOriginMutation,
} from "../_lib/http";
import { GET as getOccurrenceEvidence, POST as uploadOccurrenceEvidence } from "./evidence/route";

const FUTURE_TOLERANCE_MS = 5 * 60_000;
const MAX_DESCRIPTION_LENGTH = 1_000;
const MAX_OTHER_ERROR_LENGTH = 120;
const MAX_ATTACHMENTS = 3;
const ALLOWED_ATTACHMENT = /\.(png|jpe?g|webp|mp4|txt)$/i;
const severitySet = new Set<string>(SEVERITIES);
const statusSet = new Set<string>(OCCURRENCE_STATUSES);

function parseAttachments(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) return null;

  const names = value.map((item) =>
    typeof item === "string" ? item.trim() : "",
  );
  if (
    names.some(
      (name) => !name || name.length > 160 || !ALLOWED_ATTACHMENT.test(name),
    )
  ) {
    return null;
  }
  return names;
}

function ownsOccurrence(userId: string, occurrence: StoredOccurrence) {
  return occurrence.responsibleId === userId;
}

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("evidence") === "1") {
    return getOccurrenceEvidence(request);
  }
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (id) {
    const occurrence = await getStoredOccurrence(id);
    if (!occurrence) return apiError(422, "Ocorrência não encontrada.");
    if (
      !canManageAnyOccurrence(user.role) &&
      !ownsOccurrence(user.id, occurrence)
    ) {
      return apiError(403, "Você não tem permissão para acessar esta ocorrência.");
    }
    return jsonResponse({ occurrence });
  }

  const occurrences = (await listStoredOccurrences()).filter(
    (occurrence) =>
      canManageAnyOccurrence(user.role) || ownsOccurrence(user.id, occurrence),
  );
  return jsonResponse({ occurrences });
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    return uploadOccurrenceEvidence(request);
  }
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  if (!sameOriginMutation(request)) {
    return apiError(403, "Origem da requisição não autorizada.");
  }

  const body = await readJsonObject(request);
  if (!body) return apiError(422, "Revise os dados da ocorrência.");

  const clientId = cleanRequiredString(body.clientId);
  const systemId = cleanRequiredString(body.systemId);
  const moduleId = cleanRequiredString(body.moduleId);
  const catalogChoice = cleanRequiredString(body.catalogChoice);
  const severity = cleanRequiredString(body.severity);
  const occurredAt = cleanRequiredString(body.occurredAt);
  const status = cleanRequiredString(body.status);
  const responsibleId = cleanRequiredString(body.responsibleId);
  const description =
    typeof body.description === "string" ? body.description.trim() : "";

  if (
    !clientId ||
    !systemId ||
    !moduleId ||
    !catalogChoice ||
    !severity ||
    !occurredAt ||
    !status ||
    !responsibleId
  ) {
    return apiError(422, "Revise os campos obrigatórios.");
  }
  if (!(await validClient(clientId)) || !(await validSystemModule(systemId, moduleId))) {
    return apiError(422, "Cliente, sistema ou módulo inválido.");
  }
  if (!severitySet.has(severity)) {
    return apiError(422, "Gravidade inválida.");
  }
  if (!statusSet.has(status)) {
    return apiError(422, "Status inválido.");
  }
  if (!(await validManagedUserId(responsibleId))) {
    return apiError(422, "Responsável inválido.");
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return apiError(
      422,
      `A descrição deve ter no máximo ${MAX_DESCRIPTION_LENGTH} caracteres.`,
    );
  }

  const occurrenceTime = Date.parse(occurredAt);
  if (!Number.isFinite(occurrenceTime)) {
    return apiError(422, "Data da ocorrência inválida.");
  }
  if (occurrenceTime > Date.now() + FUTURE_TOLERANCE_MS) {
    return apiError(422, "A data da ocorrência não pode estar no futuro.");
  }

  const attachments = parseAttachments(body.attachments);
  if (!attachments) {
    return apiError(
      422,
      "Use até 3 evidências nos formatos PNG, JPG, WEBP, MP4 ou TXT.",
    );
  }

  let catalogItemId: string | undefined;
  let otherError: string | undefined;
  if (catalogChoice === "other") {
    otherError = cleanRequiredString(body.otherError).replace(/\s+/g, " ");
    if (otherError.length < 8 || otherError.length > MAX_OTHER_ERROR_LENGTH) {
      return apiError(
        422,
        `Descreva o outro erro entre 8 e ${MAX_OTHER_ERROR_LENGTH} caracteres.`,
      );
    }
  } else {
    const catalogItem = await getStoredCatalogItem(catalogChoice);
    if (
      !catalogItem ||
      !catalogItem.active ||
      !(await catalogMatchesReference(catalogItem, systemId, moduleId))
    ) {
      return apiError(
        422,
        "Selecione um erro ativo e compatível com o sistema e módulo.",
      );
    }
    catalogItemId = catalogItem.id;
  }

  if (user.role === "suporte" && responsibleId !== user.id) {
    return apiError(
      403,
      "Você não tem permissão para atribuir a ocorrência a outra pessoa.",
    );
  }

  const now = new Date().toISOString();
  const occurrence = await createStoredOccurrence({
    clientId,
    systemId,
    moduleId,
    ...(catalogItemId ? { catalogItemId } : {}),
    ...(otherError ? { otherError } : {}),
    description,
    severity: severity as DemoSeverity,
    occurredAt: new Date(occurrenceTime).toISOString(),
    status: status as DemoOccurrenceStatus,
    responsibleId,
    authorId: user.id,
    attachments,
    createdAt: now,
    updatedAt: now,
  });

  return jsonResponse({ occurrence }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  if (!sameOriginMutation(request)) {
    return apiError(403, "Origem da requisição não autorizada.");
  }

  const body = await readJsonObject(request);
  if (!body) return apiError(422, "Revise os dados da ocorrência.");

  const id = cleanRequiredString(body.id);
  if (!id) return apiError(422, "Ocorrência não informada.");

  const current = await getStoredOccurrence(id);
  if (!current) return apiError(422, "Ocorrência não encontrada.");
  if (
    !canManageAnyOccurrence(user.role) &&
    !ownsOccurrence(user.id, current)
  ) {
    return apiError(403, "Você não tem permissão para alterar esta ocorrência.");
  }

  const hasDescription = Object.hasOwn(body, "description");
  const hasSeverity = Object.hasOwn(body, "severity");
  const hasStatus = Object.hasOwn(body, "status");
  const hasResponsible = Object.hasOwn(body, "responsibleId");
  const hasAttachments = Object.hasOwn(body, "attachments");
  if (!hasDescription && !hasSeverity && !hasStatus && !hasResponsible && !hasAttachments) {
    return apiError(422, "Nenhuma alteração válida foi informada.");
  }

  const description = hasDescription
    ? typeof body.description === "string"
      ? body.description.trim()
      : null
    : current.description;
  const severity = hasSeverity
    ? cleanRequiredString(body.severity)
    : current.severity;
  const status = hasStatus
    ? cleanRequiredString(body.status)
    : current.status;
  const responsibleId = hasResponsible
    ? cleanRequiredString(body.responsibleId)
    : current.responsibleId;
  const attachments = hasAttachments
    ? parseAttachments(body.attachments)
    : current.attachments;

  if (description === null || description.length > MAX_DESCRIPTION_LENGTH) {
    return apiError(
      422,
      `A descrição deve ter no máximo ${MAX_DESCRIPTION_LENGTH} caracteres.`,
    );
  }
  if (!severitySet.has(severity)) {
    return apiError(422, "Gravidade inválida.");
  }
  if (!statusSet.has(status)) {
    return apiError(422, "Status inválido.");
  }
  if (!(await validManagedUserId(responsibleId))) {
    return apiError(422, "Responsável inválido.");
  }
  if (!attachments) {
    return apiError(
      422,
      "Use até 3 evidências nos formatos PNG, JPG, WEBP, MP4 ou TXT.",
    );
  }
  if (user.role === "suporte" && responsibleId !== user.id) {
    return apiError(
      403,
      "Você não tem permissão para reatribuir esta ocorrência.",
    );
  }

  const updatedAt = new Date().toISOString();
  const occurrence: StoredOccurrence = {
    ...current,
    description,
    severity: severity as DemoSeverity,
    status: status as DemoOccurrenceStatus,
    responsibleId,
    attachments,
    updatedAt,
  };
  await updateStoredOccurrence(occurrence);

  return jsonResponse({
    occurrence,
    changes: { description, severity, status, responsibleId, attachments, updatedAt },
  });
}

export async function DELETE(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  if (user.role !== "administrador") {
    return apiError(403, "Somente Administradores podem excluir registros.");
  }
  if (!sameOriginMutation(request)) {
    return apiError(403, "Origem da requisição não autorizada.");
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return apiError(422, "Registro não informado.");
  const occurrence = await getStoredOccurrence(id);
  if (!occurrence) return apiError(422, "Ocorrência não encontrada.");

  const deleted = await softDeleteStoredOccurrence(id, user.id);
  if (!deleted) return apiError(422, "Não foi possível excluir o registro.");
  return jsonResponse({ deleted: true, id });
}
