import { sessionUser } from "../../_lib/demo-auth";
import { getDevelopmentAction, updateDevelopmentAction } from "../../_lib/development-action-db";
import { apiError, jsonResponse, sameOriginMutation } from "../../_lib/http";
import { supportSupabase } from "../../_lib/supabase";

const BUCKET = "development-action-evidence";
const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4", "text/plain", "application/pdf"]);

function canAccess(user: { id: string; role: string }, supportId: string, developerId: string) {
  return user.role === "administrador" || user.id === supportId || user.id === developerId || user.role === "suporte";
}

function safeFileName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120);
}

async function ensureBucket() {
  const storage = supportSupabase().storage;
  const current = await storage.getBucket(BUCKET);
  if (!current.error) return;
  const created = await storage.createBucket(BUCKET, {
    public: false, fileSizeLimit: MAX_FILE_SIZE, allowedMimeTypes: [...ALLOWED_TYPES],
  });
  if (created.error && !/already exists/i.test(created.error.message)) throw new Error(created.error.message);
}

export async function POST(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  if (!sameOriginMutation(request)) return apiError(403, "Origem da requisição não autorizada.");
  const form = await request.formData().catch(() => null);
  const actionId = form?.get("actionId");
  const action = typeof actionId === "string" ? await getDevelopmentAction(actionId.trim()) : null;
  if (!action) return apiError(422, "Ação não encontrada.");
  if (!canAccess(user, action.supportId, action.developerId)) return apiError(403, "Você não pode anexar evidências nesta ação.");
  const files = form!.getAll("files").filter((item): item is File => item instanceof File);
  if (!files.length || action.evidencePaths.length + files.length > MAX_FILES) return apiError(422, "A ação pode ter no máximo 5 evidências.");
  if (files.some((file) => !ALLOWED_TYPES.has(file.type) || file.size > MAX_FILE_SIZE)) {
    return apiError(422, "Use PNG, JPG, WEBP, MP4, PDF ou TXT de até 10 MB cada.");
  }
  await ensureBucket();
  const storage = supportSupabase().storage.from(BUCKET);
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const path = `${action.id}/${crypto.randomUUID()}-${safeFileName(file.name) || "evidencia"}`;
      const result = await storage.upload(path, file, { contentType: file.type, upsert: false });
      if (result.error) throw new Error(result.error.message);
      uploaded.push(path);
    }
    const updated = await updateDevelopmentAction(action.id, {
      evidence_json: [...action.evidencePaths, ...uploaded], updated_at: new Date().toISOString(),
    });
    return jsonResponse({ action: updated }, { status: 201 });
  } catch (error) {
    if (uploaded.length) await storage.remove(uploaded);
    return apiError(500, error instanceof Error ? error.message : "Não foi possível enviar as evidências.");
  }
}

export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return apiError(401, "Sessão inválida ou expirada.");
  const url = new URL(request.url);
  const actionId = url.searchParams.get("actionId")?.trim();
  const path = url.searchParams.get("path")?.trim();
  const action = actionId ? await getDevelopmentAction(actionId) : null;
  if (!action || !path || !canAccess(user, action.supportId, action.developerId)) return apiError(403, "Você não pode acessar esta evidência.");
  if (!action.evidencePaths.includes(path) || !path.startsWith(`${action.id}/`)) return apiError(404, "Evidência não encontrada.");
  const signed = await supportSupabase().storage.from(BUCKET).createSignedUrl(path, 60);
  if (signed.error || !signed.data?.signedUrl) return apiError(500, "Não foi possível abrir a evidência.");
  return Response.redirect(signed.data.signedUrl, 302);
}
