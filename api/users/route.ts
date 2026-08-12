import {
  countActiveAdministrators,
  createManagedUser,
  getManagedUser,
  isDemoRole,
  listAssignableUsers,
  listDeveloperUsers,
  listManagedUsers,
  sessionUser,
  softDeleteManagedUser,
  updateManagedUser,
} from "../_lib/demo-auth";
import {
  apiError,
  cleanRequiredString,
  jsonResponse,
  readJsonObject,
  sameOriginMutation,
} from "../_lib/http";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export async function GET(request: Request) {
  const actor = await sessionUser(request);
  if (!actor) return apiError(401, "Sessão inválida ou expirada.");

  const scope = new URL(request.url).searchParams.get("scope");
  if (scope === "assignable") {
    return jsonResponse({ users: await listAssignableUsers() });
  }
  if (scope === "developers") {
    return jsonResponse({ users: await listDeveloperUsers() });
  }
  if (actor.role !== "administrador") {
    return apiError(403, "Somente Administradores podem gerenciar usuários.");
  }
  return jsonResponse({ users: await listManagedUsers() });
}

export async function POST(request: Request) {
  const actor = await sessionUser(request);
  if (!actor) return apiError(401, "Sessão inválida ou expirada.");
  if (actor.role !== "administrador") {
    return apiError(403, "Somente Administradores podem criar usuários.");
  }
  if (!sameOriginMutation(request)) {
    return apiError(403, "Origem da requisição não autorizada.");
  }

  const body = await readJsonObject(request);
  if (!body) return apiError(422, "Revise os dados do usuário.");
  const name = cleanName(body.name);
  const email = cleanRequiredString(body.email).toLocaleLowerCase("pt-BR");
  const password = cleanRequiredString(body.password);
  if (name.length < 2 || name.length > 80) {
    return apiError(422, "Informe um nome entre 2 e 80 caracteres.");
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return apiError(422, "Informe um e-mail válido.");
  }
  if (!isDemoRole(body.role)) {
    return apiError(422, "Selecione um perfil de acesso válido.");
  }
  if (password.length < 8 || password.length > 128) {
    return apiError(422, "A senha temporária deve ter entre 8 e 128 caracteres.");
  }

  let user;
  try {
    user = await createManagedUser({ name, email, role: body.role, password });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[api/users] failed to create user", {
      role: body.role,
      error: message,
    });
    if (/role|check constraint|violates check/i.test(message)) {
      return apiError(
        503,
        "O banco de dados ainda não está preparado para o perfil Desenvolvedor. Execute a migração developer_role.sql no Supabase e tente novamente.",
      );
    }
    throw error;
  }
  if (!user) {
    return apiError(409, "Já existe um usuário com este e-mail ou nome de acesso.");
  }
  return jsonResponse({ user }, { status: 201 });
}

export async function PATCH(request: Request) {
  const actor = await sessionUser(request);
  if (!actor) return apiError(401, "Sessão inválida ou expirada.");
  if (actor.role !== "administrador") {
    return apiError(403, "Somente Administradores podem alterar usuários.");
  }
  if (!sameOriginMutation(request)) {
    return apiError(403, "Origem da requisição não autorizada.");
  }

  const body = await readJsonObject(request);
  if (!body) return apiError(422, "Revise os dados do usuário.");
  const id = cleanRequiredString(body.id);
  const current = id ? await getManagedUser(id) : null;
  if (!current) return apiError(422, "Usuário não encontrado.");

  const name = body.name === undefined ? current.name : cleanName(body.name);
  const role = body.role === undefined ? current.role : body.role;
  const active = body.active === undefined ? current.active : body.active;
  const password =
    typeof body.password === "string" ? body.password.trim() : undefined;

  if (name.length < 2 || name.length > 80) {
    return apiError(422, "Informe um nome entre 2 e 80 caracteres.");
  }
  if (!isDemoRole(role)) {
    return apiError(422, "Selecione um perfil de acesso válido.");
  }
  if (typeof active !== "boolean") {
    return apiError(422, "Status de acesso inválido.");
  }
  if (password && (password.length < 8 || password.length > 128)) {
    return apiError(422, "A nova senha deve ter entre 8 e 128 caracteres.");
  }
  if (id === actor.id && (role !== actor.role || !active)) {
    return apiError(403, "Você não pode remover o próprio acesso administrativo.");
  }
  if (
    current.role === "administrador" &&
    current.active &&
    (role !== "administrador" || !active) &&
    (await countActiveAdministrators()) <= 1
  ) {
    return apiError(422, "O portal precisa manter ao menos um Administrador ativo.");
  }

  const user = await updateManagedUser({
    id,
    name,
    role,
    active,
    ...(password ? { password } : {}),
  });
  return jsonResponse({ user });
}

export async function DELETE(request: Request) {
  const actor = await sessionUser(request);
  if (!actor) return apiError(401, "Sessão inválida ou expirada.");
  if (actor.role !== "administrador") {
    return apiError(403, "Somente Administradores podem excluir usuários.");
  }
  if (!sameOriginMutation(request)) {
    return apiError(403, "Origem da requisição não autorizada.");
  }

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return apiError(422, "Usuário não informado.");
  if (id === actor.id) {
    return apiError(403, "Você não pode excluir a própria conta.");
  }
  const current = await getManagedUser(id);
  if (!current) return apiError(422, "Usuário não encontrado.");
  if (
    current.role === "administrador" &&
    current.active &&
    (await countActiveAdministrators()) <= 1
  ) {
    return apiError(422, "O portal precisa manter ao menos um Administrador ativo.");
  }

  const deleted = await softDeleteManagedUser(id, actor.id);
  if (!deleted) return apiError(422, "Não foi possível excluir o usuário.");
  return jsonResponse({ deleted: true, id });
}
