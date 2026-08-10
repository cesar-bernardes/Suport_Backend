import { sessionUser } from "../../_lib/demo-auth";
import { apiError, jsonResponse, sameOriginMutation } from "../../_lib/http";
import { supportDatabase } from "../../_lib/supabase";

const DEMO_IDS = {
  portal_users: ["u1", "u2", "u3"],
  portal_occurrences: Array.from({ length: 12 }, (_, index) => `o${index + 1}`),
  portal_agenda_entries: ["agenda-demo-1", "agenda-demo-2"],
  catalog_items: ["c1", "c2", "c3", "c4", "c5", "c6"],
  clients: ["cl1", "cl2", "cl3", "cl4", "cl5"],
  systems: ["s1", "s2", "s3"],
  modules: ["m1", "m2", "m3", "m4", "m5", "m6"],
} as const;

export async function POST(request: Request) {
  const actor = await sessionUser(request);
  if (!actor) return apiError(401, "Sessão inválida ou expirada.");
  if (actor.role !== "administrador") {
    return apiError(403, "Somente Administradores podem executar esta limpeza.");
  }
  if (!sameOriginMutation(request)) {
    return apiError(403, "Origem da requisição não autorizada.");
  }

  const db = supportDatabase();
  const now = new Date().toISOString();
  const results: Record<string, number> = {};

  for (const [table, ids] of Object.entries(DEMO_IDS)) {
    const changes: Record<string, unknown> = { deleted_at: now, updated_at: now };
    if (["portal_users", "catalog_items", "clients", "systems", "modules"].includes(table)) {
      changes.active = false;
    }
    if (["portal_users", "portal_occurrences", "portal_agenda_entries"].includes(table)) {
      changes.deleted_by = actor.id;
    }

    const result = await db.from(table).update(changes).in("id", [...ids])
      .is("deleted_at", null).select("id");
    if (result.error) return apiError(500, `Falha ao limpar ${table}: ${result.error.message}`);
    results[table] = result.data?.length ?? 0;
  }

  return jsonResponse({ cleaned: true, results });
}
