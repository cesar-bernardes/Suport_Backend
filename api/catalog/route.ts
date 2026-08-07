import { canManageCatalog, sessionUser } from "../_lib/demo-auth";
import {
  normalizeCatalogName,
  type StoredCatalogItem,
  validSystemModule,
} from "../_lib/demo-store";
import {
  createStoredCatalogItem,
  findStoredCatalogDuplicate,
  getStoredCatalogItem,
  listStoredCatalogItems,
  updateStoredCatalogItem,
} from "../_lib/catalog-db";
import {
  apiError,
  cleanRequiredString,
  jsonResponse,
  readJsonObject,
  sameOriginMutation,
} from "../_lib/http";

const MIN_NAME_LENGTH = 5;
const MAX_NAME_LENGTH = 100;
const MAX_ALIASES = 10;
const MAX_ALIAS_LENGTH = 60;

function parseAliases(value: unknown, fallback: string[] = []) {
  if (value === undefined) return fallback;
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : null;
  if (!raw || raw.length > MAX_ALIASES) return null;

  const aliases = raw.map((alias) =>
    typeof alias === "string" ? alias.trim().replace(/\s+/g, " ") : "",
  );
  if (aliases.some((alias) => !alias || alias.length > MAX_ALIAS_LENGTH)) {
    return null;
  }

  return [...new Map(aliases.map((alias) => [normalizeCatalogName(alias), alias])).values()];
}

function validateName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    return null;
  }
  return name;
}

export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  return jsonResponse({ items: await listStoredCatalogItems() });
}

export async function POST(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  if (!canManageCatalog(user.role)) {
    return apiError(403, "Você não tem permissão para alterar o Catálogo.");
  }
  if (!sameOriginMutation(request)) {
    return apiError(403, "Origem da requisição não autorizada.");
  }

  const body = await readJsonObject(request);
  if (!body) return apiError(422, "Revise os dados do Catálogo.");

  const systemId = cleanRequiredString(body.systemId);
  const moduleId = cleanRequiredString(body.moduleId);
  const name = validateName(body.name);
  const aliases = parseAliases(body.aliases);
  const active = body.active === undefined ? true : body.active;

  if (!systemId || !moduleId || !name) {
    return apiError(
      422,
      `Informe sistema, módulo e um nome entre ${MIN_NAME_LENGTH} e ${MAX_NAME_LENGTH} caracteres.`,
    );
  }
  if (!validSystemModule(systemId, moduleId)) {
    return apiError(422, "A combinação de sistema e módulo é inválida.");
  }
  if (!aliases) {
    return apiError(
      422,
      `Informe até ${MAX_ALIASES} termos alternativos de no máximo ${MAX_ALIAS_LENGTH} caracteres.`,
    );
  }
  if (typeof active !== "boolean") {
    return apiError(422, "Status do item inválido.");
  }

  const normalizedName = normalizeCatalogName(name);
  if (await findStoredCatalogDuplicate(systemId, moduleId, normalizedName)) {
    return apiError(
      409,
      "Já existe um item com este nome para o sistema e módulo.",
    );
  }

  const now = new Date().toISOString();
  const item: StoredCatalogItem = {
    id: `c-${crypto.randomUUID()}`,
    systemId,
    moduleId,
    name,
    normalizedName,
    aliases,
    active,
    createdAt: now,
    updatedAt: now,
  };
  return jsonResponse({ item: await createStoredCatalogItem(item) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  if (!canManageCatalog(user.role)) {
    return apiError(403, "Você não tem permissão para alterar o Catálogo.");
  }
  if (!sameOriginMutation(request)) {
    return apiError(403, "Origem da requisição não autorizada.");
  }

  const body = await readJsonObject(request);
  if (!body) return apiError(422, "Revise os dados do Catálogo.");

  const id = cleanRequiredString(body.id);
  if (!id) return apiError(422, "Item do Catálogo não informado.");
  const current = await getStoredCatalogItem(id);
  if (!current) return apiError(422, "Item do Catálogo não encontrado.");

  const systemId =
    body.systemId === undefined
      ? current.systemId
      : cleanRequiredString(body.systemId);
  const moduleId =
    body.moduleId === undefined
      ? current.moduleId
      : cleanRequiredString(body.moduleId);
  const name = body.name === undefined ? current.name : validateName(body.name);
  const aliases = parseAliases(body.aliases, current.aliases);
  const active = body.active === undefined ? current.active : body.active;

  if (!systemId || !moduleId || !name) {
    return apiError(
      422,
      `Informe sistema, módulo e um nome entre ${MIN_NAME_LENGTH} e ${MAX_NAME_LENGTH} caracteres.`,
    );
  }
  if (!validSystemModule(systemId, moduleId)) {
    return apiError(422, "A combinação de sistema e módulo é inválida.");
  }
  if (!aliases) {
    return apiError(
      422,
      `Informe até ${MAX_ALIASES} termos alternativos de no máximo ${MAX_ALIAS_LENGTH} caracteres.`,
    );
  }
  if (typeof active !== "boolean") {
    return apiError(422, "Status do item inválido.");
  }

  const normalizedName = normalizeCatalogName(name);
  if (await findStoredCatalogDuplicate(systemId, moduleId, normalizedName, id)) {
    return apiError(
      409,
      "Já existe um item com este nome para o sistema e módulo.",
    );
  }

  const item: StoredCatalogItem = {
    ...current,
    systemId,
    moduleId,
    name,
    normalizedName,
    aliases,
    active,
    updatedAt: new Date().toISOString(),
  };
  return jsonResponse({ item: await updateStoredCatalogItem(item) });
}
