import { sessionUser } from "../_lib/demo-auth";
import {
  apiError,
  cleanRequiredString,
  jsonResponse,
  readJsonObject,
  sameOriginMutation,
} from "../_lib/http";
import { listReferenceData } from "../_lib/reference-data";
import { supportDatabase } from "../_lib/supabase";

type ReferenceKind = "system" | "module";

function canManage(role: string) {
  return role === "suporte" || role === "gestor" || role === "administrador";
}

function validKind(value: unknown): value is ReferenceKind {
  return value === "system" || value === "module";
}

function cleanName(value: unknown) {
  return cleanRequiredString(value).replace(/\s+/g, " ");
}

async function duplicateName(
  kind: ReferenceKind,
  name: string,
  systemId?: string,
  ignoredId?: string,
) {
  let query = supportDatabase()
    .from(kind === "system" ? "systems" : "modules")
    .select("id,name")
    .eq("active", true)
    .is("deleted_at", null);
  if (kind === "module") query = query.eq("system_id", systemId);
  if (ignoredId) query = query.neq("id", ignoredId);
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  const normalized = name.toLocaleLowerCase("pt-BR");
  return result.data?.some(
    (item: { name: string }) =>
      item.name.trim().toLocaleLowerCase("pt-BR") === normalized,
  );
}

async function requireManager(request: Request) {
  const user = await sessionUser(request);
  if (!user) return { error: apiError(401, "Sessão inválida ou expirada.") };
  if (!canManage(user.role)) {
    return { error: apiError(403, "Seu perfil não pode gerenciar sistemas e módulos.") };
  }
  if (!sameOriginMutation(request)) {
    return { error: apiError(403, "Origem da requisição não autorizada.") };
  }
  return { user };
}

export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  return jsonResponse(await listReferenceData());
}

export async function POST(request: Request) {
  const access = await requireManager(request);
  if ("error" in access) return access.error;
  const body = await readJsonObject(request);
  if (!body || !validKind(body.kind)) return apiError(422, "Tipo de cadastro inválido.");
  const name = cleanName(body.name);
  if (name.length < 2 || name.length > 80) {
    return apiError(422, "Informe um nome entre 2 e 80 caracteres.");
  }

  const db = supportDatabase();
  if (body.kind === "system") {
    if (await duplicateName("system", name)) {
      return apiError(409, "Já existe um sistema ativo com este nome.");
    }
    const systemId = crypto.randomUUID();
    const system = await db.from("systems").insert({
      id: systemId,
      name,
      active: true,
      deleted_at: null,
    });
    if (system.error) return apiError(500, system.error.message);
    const general = await db.from("modules").insert({
      id: crypto.randomUUID(),
      system_id: systemId,
      name: "Geral",
      is_general: true,
      active: true,
      deleted_at: null,
    });
    if (general.error) return apiError(500, general.error.message);
  } else {
    const systemId = cleanRequiredString(body.systemId);
    const system = await db.from("systems").select("id").eq("id", systemId)
      .eq("active", true).is("deleted_at", null).maybeSingle();
    if (system.error || !system.data) return apiError(422, "Selecione um sistema ativo.");
    if (await duplicateName("module", name, systemId)) {
      return apiError(409, "Já existe um módulo ativo com este nome neste sistema.");
    }
    const isGeneral = body.isGeneral === true;
    if (isGeneral) {
      const reset = await db.from("modules").update({ is_general: false })
        .eq("system_id", systemId).eq("active", true).is("deleted_at", null);
      if (reset.error) return apiError(500, reset.error.message);
    }
    const moduleResult = await db.from("modules").insert({
      id: crypto.randomUUID(),
      system_id: systemId,
      name,
      is_general: isGeneral,
      active: true,
      deleted_at: null,
    });
    if (moduleResult.error) return apiError(500, moduleResult.error.message);
  }
  return jsonResponse(await listReferenceData(), { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await requireManager(request);
  if ("error" in access) return access.error;
  const body = await readJsonObject(request);
  if (!body || !validKind(body.kind)) return apiError(422, "Tipo de cadastro inválido.");
  const id = cleanRequiredString(body.id);
  const name = cleanName(body.name);
  if (!id || name.length < 2 || name.length > 80) {
    return apiError(422, "Revise o cadastro informado.");
  }

  const db = supportDatabase();
  if (body.kind === "system") {
    if (await duplicateName("system", name, undefined, id)) {
      return apiError(409, "Já existe um sistema ativo com este nome.");
    }
    const result = await db.from("systems").update({ name }).eq("id", id)
      .eq("active", true).is("deleted_at", null).select("id").maybeSingle();
    if (result.error) return apiError(500, result.error.message);
    if (!result.data) return apiError(404, "Sistema não encontrado.");
  } else {
    const systemId = cleanRequiredString(body.systemId);
    if (await duplicateName("module", name, systemId, id)) {
      return apiError(409, "Já existe um módulo ativo com este nome neste sistema.");
    }
    const isGeneral = body.isGeneral === true;
    if (isGeneral) {
      const reset = await db.from("modules").update({ is_general: false })
        .eq("system_id", systemId).eq("active", true).is("deleted_at", null);
      if (reset.error) return apiError(500, reset.error.message);
    }
    const result = await db.from("modules").update({
      name,
      system_id: systemId,
      is_general: isGeneral,
    }).eq("id", id).eq("active", true).is("deleted_at", null)
      .select("id").maybeSingle();
    if (result.error) return apiError(500, result.error.message);
    if (!result.data) return apiError(404, "Módulo não encontrado.");
  }
  return jsonResponse(await listReferenceData());
}

export async function DELETE(request: Request) {
  const access = await requireManager(request);
  if ("error" in access) return access.error;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id") || "";
  if (!validKind(kind) || !id) return apiError(422, "Cadastro inválido.");

  const db = supportDatabase();
  const field = kind === "system" ? "system_id" : "module_id";
  const [catalogUsage, occurrenceUsage] = await Promise.all([
    db.from("catalog_items").select("id", { count: "exact", head: true })
      .eq(field, id).is("deleted_at", null),
    db.from("portal_occurrences").select("id", { count: "exact", head: true })
      .eq(field, id).is("deleted_at", null),
  ]);
  if (catalogUsage.error) return apiError(500, catalogUsage.error.message);
  if (occurrenceUsage.error) return apiError(500, occurrenceUsage.error.message);
  if ((catalogUsage.count || 0) + (occurrenceUsage.count || 0) > 0) {
    return apiError(
      409,
      "Este cadastro está em uso. Altere os registros relacionados antes de excluí-lo.",
    );
  }

  const now = new Date().toISOString();
  if (kind === "system") {
    const modules = await db.from("modules").update({ active: false, deleted_at: now })
      .eq("system_id", id).is("deleted_at", null);
    if (modules.error) return apiError(500, modules.error.message);
  }
  const result = await db.from(kind === "system" ? "systems" : "modules")
    .update({ active: false, deleted_at: now }).eq("id", id)
    .is("deleted_at", null).select("id").maybeSingle();
  if (result.error) return apiError(500, result.error.message);
  if (!result.data) return apiError(404, kind === "system" ? "Sistema não encontrado." : "Módulo não encontrado.");
  return jsonResponse(await listReferenceData());
}
