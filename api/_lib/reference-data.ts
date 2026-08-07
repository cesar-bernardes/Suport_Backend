import { supportDatabase } from "./supabase";

let referencePromise: Promise<void> | null = null;

async function seedReferenceData() {
  const db = supportDatabase();
  const clients = await db.from("clients").upsert([
    { id: "cl1", name: "Gran Dourados", active: true, deleted_at: null },
    { id: "cl2", name: "Via Norte Logística", active: true, deleted_at: null },
    { id: "cl3", name: "Transvale Transportes", active: true, deleted_at: null },
    { id: "cl4", name: "Rota Sul", active: true, deleted_at: null },
    { id: "cl5", name: "Expresso Pantanal", active: true, deleted_at: null },
  ], { onConflict: "id" });
  if (clients.error) throw new Error(clients.error.message);

  const systems = await db.from("systems").upsert([
    { id: "s1", name: "GD Frotas", active: true, deleted_at: null },
    { id: "s2", name: "GD Mobile", active: true, deleted_at: null },
    { id: "s3", name: "Portal Cliente", active: true, deleted_at: null },
  ], { onConflict: "id" });
  if (systems.error) throw new Error(systems.error.message);

  const modules = await db.from("modules").upsert([
    { id: "m1", system_id: "s1", name: "Checklist", is_general: false, active: true, deleted_at: null },
    { id: "m2", system_id: "s1", name: "Missões", is_general: false, active: true, deleted_at: null },
    { id: "m3", system_id: "s1", name: "Geral", is_general: true, active: true, deleted_at: null },
    { id: "m4", system_id: "s2", name: "Sincronização", is_general: false, active: true, deleted_at: null },
    { id: "m5", system_id: "s2", name: "Jornada", is_general: false, active: true, deleted_at: null },
    { id: "m6", system_id: "s2", name: "Geral", is_general: true, active: true, deleted_at: null },
    { id: "m7", system_id: "s3", name: "Acesso", is_general: false, active: true, deleted_at: null },
    { id: "m8", system_id: "s3", name: "Financeiro", is_general: false, active: true, deleted_at: null },
    { id: "m9", system_id: "s3", name: "Geral", is_general: true, active: true, deleted_at: null },
  ], { onConflict: "id" });
  if (modules.error) throw new Error(modules.error.message);
}

export async function ensureReferenceData() {
  referencePromise ??= seedReferenceData().catch((error) => {
    referencePromise = null;
    throw error;
  });
  return referencePromise;
}
